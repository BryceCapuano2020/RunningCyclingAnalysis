import { DAY_MS } from '../constants'
import { median } from '../findings/stats'
import type { ActivityDigest, Sport } from '../types'
import { fitGrade, fitHeartRateSlope, RUN_SLOPE } from './fit'
import type { DatedKm, KmReading } from './fit'
import { FITNESS } from './params'
import { runReadings } from './runReadings'
import type { RunReadings } from './runReadings'
import type { FitnessMethod } from './types'

const U = FITNESS.unit

/** One steady run (or ride) reduced to a value: the log of its speed (m/s) or power (W) at the reference heart rate. */
export interface UnitPoint {
  id: string
  startMs: number
  x: number
}

export interface UnitSeries {
  /** Oldest first, ties by id. */
  points: UnitPoint[]
  referenceHr: number | null
  method: FitnessMethod
}

export function emptySeries(tier: FitnessMethod['tier']): UnitSeries {
  return {
    points: [],
    referenceHr: null,
    method: { tier, gradePassThrough: null, speedPerBpm: 0, fitted: 0 },
  }
}

export const byTime = (
  a: { startMs: number; id: string },
  b: { startMs: number; id: string },
): number => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The library's reference heart rate: the median of the heart rates of its steady flat kilometres over the newest 52 weeks, to the nearest 5 bpm. */
export function referenceOf(heartRates: readonly number[]): number | null {
  if (heartRates.length === 0) return null
  return Math.round(median(heartRates) / U.referenceStepBpm) * U.referenceStepBpm
}

const valueOf = (kms: readonly KmReading[], ref: number, kappa: number, beta: number) =>
  median(kms.map((k) => k.lnClock - kappa * k.credit - beta * (k.hr - ref)))

/**
 * One value per steady run, from the run digests as of one date. The unit is the steady-pace one:
 * kilometres 2 to 10 within 20 bpm of the reference heart rate, with the grade credit it earns passed
 * through by the share this library's own runs show (kappa), and a heart-rate slope (beta) fitted the
 * same way; runs whose pace wanders from kilometre to kilometre are left out. When that fit is unstable
 * the strict unit is read instead: flat kilometres with a steady heart rate and pace, at the model's whole credit.
 * Heart rate that is set aside is left out. Pure: any order of `digests` gives the same series.
 */
export function runSeries(
  digests: readonly ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
  pinnedReferenceHr?: number,
): UnitSeries {
  const readings: RunReadings[] = []
  for (const digest of digests) {
    const found = setAside.has(digest.id) ? null : runReadings(digest, sport)
    if (found !== null) readings.push(found)
  }
  if (readings.length === 0) return emptySeries('steady-pace')
  // Sums are taken in time order, so the digests may arrive in any order and give the same bits.
  readings.sort(byTime)
  const newest = Math.max(...readings.map((r) => r.startMs))
  const newestYear = readings.filter((r) => r.startMs > newest - U.referenceWeeks * 7 * DAY_MS)
  // The steady flat kilometres name the reference; a library with none in the newest year falls back to all
  // the kilometres that pass the loose tests, so a hilly library still has a reference.
  const strictHr = newestYear.flatMap((r) => r.strict.map((k) => k.hr))
  const heartRates =
    strictHr.length > 0 ? strictHr : newestYear.flatMap((r) => r.loose.map((k) => k.hr))
  const ref = pinnedReferenceHr ?? referenceOf(heartRates)
  if (ref === null) return emptySeries('steady-pace')
  const inBand = (k: KmReading) => Math.abs(k.hr - ref) <= U.hrHalfBand
  const steady = readings
    .filter((r) => r.steadyPace)
    .map((r) => ({ r, kms: r.loose.filter(inBand) }))
    .filter((z) => z.kms.length >= U.minKm)
  const dated: DatedKm[] = steady.map((z) => ({ startMs: z.r.startMs, kms: z.kms }))
  const fit = fitGrade(dated)
  if (fit.stable) {
    const points = steady.map((z) => ({
      id: z.r.id,
      startMs: z.r.startMs,
      x: valueOf(z.kms, ref, fit.kappa, fit.beta),
    }))
    return {
      points: points.sort(byTime),
      referenceHr: ref,
      method: {
        tier: 'steady-pace',
        gradePassThrough: -fit.kappa,
        speedPerBpm: fit.beta,
        fitted: fit.n,
      },
    }
  }
  const strict = readings
    .map((r) => ({ r, kms: r.strict.filter(inBand) }))
    .filter((z) => z.kms.length >= U.strict.minKm)
  const rows = strict.flatMap((z) =>
    z.kms.map((k) => ({ startMs: z.r.startMs, hr: k.hr, value: k.lnClock + k.credit })),
  )
  const beta = fitHeartRateSlope(rows, RUN_SLOPE)
  const points = strict.map((z) => ({
    id: z.r.id,
    startMs: z.r.startMs,
    x: valueOf(z.kms, ref, -1, beta),
  }))
  return {
    points: points.sort(byTime),
    referenceHr: ref,
    method: { tier: 'strict', gradePassThrough: 1, speedPerBpm: beta, fitted: rows.length },
  }
}

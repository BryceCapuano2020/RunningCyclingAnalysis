import { DAY_MS } from '../constants'
import { median } from '../findings/stats'
import type { ActivityDigest, LocalDayShift, Sport } from '../types'
import { fitHeartRateSlope } from './fit'
import type { SlopeLimits } from './fit'
import { FITNESS } from './params'
import { byTime, emptySeries, referenceOf, unitPoint } from './unit'
import type { UnitSeries } from './unit'

const R = FITNESS.ride

interface RideBlocks {
  id: string
  startMs: number
  localDayShift: LocalDayShift | undefined
  blocks: { hr: number; ln: number }[]
}

const cache = new WeakMap<ActivityDigest, RideBlocks | null>()

/** The five-minute blocks of a ride with a power meter that are measured (not terms of a virtual model) and have power. */
function rideBlocks(digest: ActivityDigest, sport: Sport): RideBlocks | null {
  if (digest.sport !== sport) return null
  if (cache.has(digest)) return cache.get(digest)!
  const eligible =
    digest.powerSource === 'measured' &&
    !digest.indoor &&
    digest.hasHeartRate &&
    !digest.flagCounts['hr-spike'] &&
    !digest.flagCounts['hr-cadence-lock'] &&
    !digest.flagCounts['hr-dropout']
  const found: RideBlocks | null = eligible
    ? {
        id: digest.id,
        startMs: digest.startMs,
        localDayShift: digest.localDayShift,
        blocks: digest.hrBlocks
          .filter((b) => b.terms === null && b.value > 0 && Number.isFinite(b.heartRate))
          .map((b) => ({ hr: b.heartRate, ln: Math.log(b.value) })),
      }
    : null
  cache.set(digest, found)
  return found
}

const RIDE_SLOPE: SlopeLimits = {
  minBlock: R.minBlockRides,
  min: R.betaMin,
  max: R.betaMax,
  fallback: R.betaFallback,
}

/**
 * One value per ride with a power meter: the log of its watts at the reference heart rate, from the
 * five-minute blocks within 20 bpm of it (at least two), moved to the reference by the library's own
 * slope. Indoor rides are left out: a trainer reads differently from the road at the same heart rate, and
 * comparing the two would read the switch as fitness. Heart rate that is set aside is left out. Rides carry no
 * steadiness test, so their spread is wider than a run's (2.4% to 4.5% a ride in the research; the monitor reads
 * the spread from the library's own rides). `ride.sim.test.ts` checks the unit at those spreads.
 */
export function rideSeries(
  digests: readonly ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
): UnitSeries {
  const rides: RideBlocks[] = []
  for (const digest of digests) {
    const found = setAside.has(digest.id) ? null : rideBlocks(digest, sport)
    if (found !== null) rides.push(found)
  }
  if (rides.length === 0) return emptySeries('power')
  rides.sort(byTime)
  const newest = Math.max(...rides.map((r) => r.startMs))
  const ref = referenceOf(
    rides
      .filter((r) => r.startMs > newest - FITNESS.unit.referenceWeeks * 7 * DAY_MS)
      .flatMap((r) => r.blocks.map((b) => b.hr)),
  )
  if (ref === null) return emptySeries('power')
  const rows = rides
    .map((r) => ({ r, blocks: r.blocks.filter((b) => Math.abs(b.hr - ref) <= R.hrHalfBand) }))
    .filter((z) => z.blocks.length >= R.minBlocks)
    .map((z) => ({
      id: z.r.id,
      startMs: z.r.startMs,
      localDayShift: z.r.localDayShift,
      hr: median(z.blocks.map((b) => b.hr)),
      ln: median(z.blocks.map((b) => b.ln)),
    }))
  const beta = fitHeartRateSlope(
    rows.map((r) => ({ startMs: r.startMs, hr: r.hr, value: r.ln })),
    RIDE_SLOPE,
  )
  return {
    points: rows
      .map((r) => unitPoint(r.id, r.startMs, r.ln - beta * (r.hr - ref), r.localDayShift))
      .sort(byTime),
    referenceHr: ref,
    method: {
      tier: 'power',
      gradePassThrough: null,
      speedPerBpm: beta,
      fitted: rows.length,
      seasonal: null,
    },
  }
}

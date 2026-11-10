import { DAY_MS, DURATIONS_S } from '../../constants'
import { flatSpeedToMetabolic } from '../../metabolic'
import { sampleDataset } from '../../synthetic'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../../types'
import { digestActivity } from '../digestActivity'

const { activities } = sampleDataset()
const digests = activities.map((activity) => digestActivity(activity))

/** A digest of the sample, to copy: a run, or a ride with a power meter. */
const TEMPLATE: Record<Sport, ActivityDigest> = {
  run: digests.find((d) => d.sport === 'run')!,
  ride: digests.find((d) => d.sport === 'ride' && d.powerSource === 'measured')!,
}

const NO_CURVE: DigestCurvePoint[] = DURATIONS_S.map((durationS) => ({
  durationS,
  value: Number.NaN,
  startIndex: 0,
  windowS: durationS,
  heartRate: null,
  terms: null,
}))

/** Monday 6 January 2025, midday UTC: the first day of the first week. */
export const MONDAY = Date.UTC(2025, 0, 6, 12)

/** One steady block: its heart rate, and its output as the sport reads it, m/s for a run and W for a ride. */
export interface Steady {
  heartRate: number
  output: number
}

/** A digest of one sport with only the given steady blocks. */
export function withBlocks(
  sport: Sport,
  id: string,
  startMs: number,
  blocks: Steady[],
  over: Partial<ActivityDigest> = {},
): ActivityDigest {
  return {
    ...TEMPLATE[sport],
    id,
    startMs,
    curve: NO_CURVE,
    calibration: null,
    climbSections: [],
    indoor: false,
    hrBlocks: blocks.map(({ heartRate, output }) => ({
      heartRate,
      value: sport === 'run' ? flatSpeedToMetabolic(output) : output,
      terms: null,
    })),
    ...over,
  }
}

/** The heart rates of one activity's blocks: five across the range, shifted a little by activity. */
export function heartRatesOf(index: number): number[] {
  return [125, 135, 145, 155, 165].map((hr, i) => hr + ((index + i) % 3) - 1)
}

/** A run is faster, and a ride puts out more, the higher the heart rate: 0.045 m/s and 1.6 W per bpm. */
export const BASE: Record<Sport, (heartRate: number) => number> = {
  run: (heartRate) => 0.045 * heartRate,
  ride: (heartRate) => 1.6 * heartRate,
}

/** The days of the week (0 is Monday) that `perWeek` activities a week are on. */
export const DAYS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 5],
  4: [0, 2, 4, 5],
  8: [0, 1, 2, 3, 4, 5, 6, 6],
}

/**
 * `perWeek` activities a week (three by default) for `weeks` weeks from MONDAY. Each holds the blocks of
 * heartRatesOf, with output BASE times `factor(startMs)`, times `noise()` for each block and
 * `dayNoise()` for each activity, the way one day is better or worse than another.
 */
export function weeksOf(
  sport: Sport,
  weeks: number,
  factor: (startMs: number) => number,
  noise: () => number = () => 1,
  perWeek = 3,
  dayNoise: () => number = () => 1,
): ActivityDigest[] {
  const out: ActivityDigest[] = []
  const days = DAYS[perWeek]!
  for (let week = 0; week < weeks; week++) {
    for (const [i, day] of days.entries()) {
      const index = week * days.length + i
      const startMs = MONDAY + (week * 7 + day) * DAY_MS
      const effect = dayNoise()
      const blocks = heartRatesOf(index).map((heartRate) => ({
        heartRate,
        output: BASE[sport](heartRate) * factor(startMs) * effect * noise(),
      }))
      out.push(withBlocks(sport, `${sport}-${index}`, startMs, blocks))
    }
  }
  return out
}

/** The digests, each with the fields `change` gives it for that digest. */
export function revised(
  list: ActivityDigest[],
  change: (digest: ActivityDigest) => Partial<ActivityDigest>,
): ActivityDigest[] {
  return list.map((digest) => Object.assign({}, digest, change(digest)))
}

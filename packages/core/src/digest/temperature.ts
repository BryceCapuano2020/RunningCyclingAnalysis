import type { Activity, DigestTemperature } from '../types'
import {
  MAX_DIGEST_TEMPERATURE_C,
  MIN_DIGEST_TEMPERATURE_C,
  MIN_TEMPERATURE_COVERAGE,
} from './readLimits'

/** The temperature summary of revision 7 (D12 section 2.1). */
export const TEMPERATURE = {
  /** Seconds at the start left out: the warm-up, and the time a wrist sensor takes to equilibrate. */
  warmupS: 600,
  /** Whole minutes of eligible time that must be there. */
  minMinutes: 10,
  /** A minute with fewer readings than this is dropped. */
  minReadingsPerMinute: 30,
  /** The median is rounded to a half degree and the coverage to a twentieth. */
  halvesPerDegree: 2,
  twentiethsPerWhole: 20,
} as const

/** Whether a reading is one: finite and inside the range a summary may hold (which also leaves out the FIT sentinel, 0x7F = 127). */
const valid = (c: number): boolean =>
  Number.isFinite(c) && c >= MIN_DIGEST_TEMPERATURE_C && c <= MAX_DIGEST_TEMPERATURE_C

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * The day's warmth as the sensor read it, or undefined when there is no usable reading. A wrist sensor reads
 * between skin and air, so this is a monotone index of how warm the day was, not the air temperature.
 *
 * Eligible seconds are the moving ones (`moving`) from `warmupS` of elapsed time on. Valid readings in them are
 * grouped into whole minutes of eligible time; a minute with too few readings is dropped; the summary is the
 * median of the minute means, so a sunlit stretch or a pocket does not move it. Absent for a file with no
 * temperature, under `minMinutes` of eligible time, or with readings on under half of the eligible seconds.
 */
export function temperatureSummary(
  activity: Pick<Activity, 'n' | 'temperature'>,
  moving: Uint8Array,
): DigestTemperature | undefined {
  const { temperature } = activity
  if (temperature === undefined) return undefined
  const T = TEMPERATURE
  const means: number[] = []
  let eligible = 0
  let readings = 0
  let sum = 0
  let inMinute = 0
  let eligibleInMinute = 0
  const closeMinute = (): void => {
    if (inMinute >= T.minReadingsPerMinute) means.push(sum / inMinute)
    sum = 0
    inMinute = 0
    eligibleInMinute = 0
  }
  for (let i = T.warmupS; i < activity.n; i++) {
    if (moving[i] !== 1) continue
    eligible++
    eligibleInMinute++
    const c = temperature[i]!
    if (valid(c)) {
      readings++
      sum += c
      inMinute++
    }
    if (eligibleInMinute === 60) closeMinute()
  }
  closeMinute()
  if (eligible < T.minMinutes * 60 || means.length === 0) return undefined
  const coverage = Math.round((readings / eligible) * T.twentiethsPerWhole) / T.twentiethsPerWhole
  if (coverage < MIN_TEMPERATURE_COVERAGE) return undefined
  // `+ 0` turns a rounded -0 into 0.
  return { c: Math.round(median(means) * T.halvesPerDegree) / T.halvesPerDegree + 0, coverage }
}

import { medianInPlace } from '../math'
import type { DigestTemperature } from '../types'
import {
  MAX_DIGEST_TEMPERATURE_C,
  MIN_DIGEST_TEMPERATURE_C,
  MIN_TEMPERATURE_COVERAGE,
} from './readLimits'

/**
 * The day's warmth as the sensor read it (D12 section 2.1). A wrist sensor reads between skin and air
 * temperature, so this is a monotone index of the day, not the air: fitness uses it relative to the
 * athlete's own cooler runs and never against a threshold in degrees.
 */
export const TEMPERATURE = {
  /** Seconds at the start left out: the heart-rate blocks' warm-up, and while a wrist sensor settles. */
  warmupS: 600,
  /** Fewer eligible seconds than this and there is no summary. */
  minEligibleS: 600,
  /** One mean per run of this many eligible seconds. */
  minuteS: 60,
  /** A minute with fewer valid readings than this is dropped. */
  minReadingsPerMinute: 30,
  /** Less of the eligible seconds with a valid reading than this and there is no summary. */
  minCoverage: MIN_TEMPERATURE_COVERAGE,
} as const

/**
 * The summary of a recorded temperature, or undefined when it is not usable: no reading, under ten eligible
 * minutes, or under half of them with a valid reading. Eligible seconds are moving and at or after the
 * warm-up. A reading is valid when it is a finite number in the digest's range, which also leaves out the
 * FIT sentinel. The value is the median of one-minute means, which a sunlit stretch or a pocket does not
 * move, rounded to half a degree; the coverage is rounded to 0.05.
 */
export function temperatureSummary(
  temperature: Float32Array | undefined,
  moving: Uint8Array,
): DigestTemperature | undefined {
  if (temperature === undefined) return undefined
  const { warmupS, minEligibleS, minuteS, minReadingsPerMinute, minCoverage } = TEMPERATURE
  const means: number[] = []
  let eligible = 0
  let valid = 0
  let minuteSum = 0
  let minuteCount = 0
  const closeMinute = () => {
    if (minuteCount >= minReadingsPerMinute) means.push(minuteSum / minuteCount)
    minuteSum = 0
    minuteCount = 0
  }
  for (let i = warmupS; i < moving.length; i++) {
    if (moving[i] !== 1) continue
    eligible++
    const reading = temperature[i]!
    if (
      Number.isFinite(reading) &&
      reading >= MIN_DIGEST_TEMPERATURE_C &&
      reading <= MAX_DIGEST_TEMPERATURE_C
    ) {
      valid++
      minuteSum += reading
      minuteCount++
    }
    if (eligible % minuteS === 0) closeMinute()
  }
  closeMinute()
  if (eligible < minEligibleS || means.length === 0) return undefined
  const coverage = valid / eligible
  if (coverage < minCoverage) return undefined
  return {
    c: Math.round(medianInPlace(Float64Array.from(means)) * 2) / 2,
    coverage: Math.round(coverage * 20) / 20,
  }
}

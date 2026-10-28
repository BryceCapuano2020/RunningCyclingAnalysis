import { DISTRIBUTION_BINS } from '../constants'
import type { DistributionMeasure } from '../constants'
import type { Activity, DigestDistribution, DigestDistributions, QualityReport } from '../types'

/** Absorbs the rounding of value / width, so a value on a bin edge, such as 0.3 m/s, is in the bin it opens. */
const EDGE_EPSILON = 1e-9

/** The bin a value falls in, or -1 when it is negative or past the measure's last bin. */
export function binOf(measure: DistributionMeasure, value: number): number {
  const { width, maxBin } = DISTRIBUTION_BINS[measure]
  const bin = Math.floor(value / width + EDGE_EPSILON)
  return bin < 0 || bin > maxBin ? -1 : bin
}

/**
 * Seconds in each bin over the samples that are both moving and valid, or undefined when there are
 * none. Plain loops: this runs over every sample of every activity.
 */
export function distributionOf(
  measure: DistributionMeasure,
  values: Float64Array,
  moving: Uint8Array,
  valid: Uint8Array,
): DigestDistribution | undefined {
  const seconds = new Uint32Array(DISTRIBUTION_BINS[measure].maxBin + 1)
  let first = seconds.length
  let last = -1
  for (let i = 0; i < values.length; i++) {
    if (moving[i] !== 1 || valid[i] !== 1) continue
    const bin = binOf(measure, values[i]!)
    if (bin < 0) continue
    seconds[bin]!++
    if (bin < first) first = bin
    if (bin > last) last = bin
  }
  return last < 0
    ? undefined
    : { offset: first, counts: Array.from(seconds.subarray(first, last + 1)) }
}

/** The measures kept for each sport. A ride keeps power only when the power is measured. */
export const MEASURES_OF_SPORT: Record<Activity['sport'], readonly DistributionMeasure[]> = {
  run: ['heartRate', 'speed'],
  ride: ['heartRate', 'power'],
}

/** The stream and validity mask a measure is read from, or null when the activity does not have it. */
function sourceOf(
  measure: DistributionMeasure,
  activity: Activity,
  quality: QualityReport,
  measuredPower: boolean,
): { values: Float64Array; valid: Uint8Array } | null {
  switch (measure) {
    case 'heartRate':
      return activity.hasHeartRate
        ? { values: activity.heartRate, valid: quality.validHeartRate }
        : null
    case 'power':
      return measuredPower ? { values: activity.power, valid: quality.validPower } : null
    case 'speed':
      return { values: activity.speed, valid: quality.validMotion }
  }
}

/**
 * The distributions of an activity's moving, valid samples. Power is kept only when it was measured,
 * so an estimate is never counted as a reading.
 */
export function activityDistributions(
  activity: Activity,
  quality: QualityReport,
  moving: Uint8Array,
  measuredPower: boolean,
): DigestDistributions {
  const out: DigestDistributions = {}
  for (const measure of MEASURES_OF_SPORT[activity.sport]) {
    const source = sourceOf(measure, activity, quality, measuredPower)
    if (source === null) continue
    const distribution = distributionOf(measure, source.values, moving, source.valid)
    if (distribution !== undefined) out[measure] = distribution
  }
  return out
}

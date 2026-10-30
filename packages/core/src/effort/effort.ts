import { rollingMean } from '../math'
import type { Activity, CurvePoint, EffortCheck } from '../types'
import type { EffortReference } from './reference'

export interface HeartRateSource {
  activity: Activity
  validHeartRate: Uint8Array
}

/** At or above this fraction of max heart rate, a 5 minute or longer effort is close to all-out. */
export const ALL_OUT_FRACTION = 0.9

/**
 * Cycling maximum heart rate typically runs about 5 to 7 bpm below running maximum in the same
 * athlete, so the cycling reference is never set lower than the running maximum minus this.
 */
export const RIDE_MAX_OFFSET_BPM = 6

/** The heart rate each sport's best efforts are judged against, bpm; null when unknown. */
export interface MaxHeartRates {
  run: number | null
  ride: number | null
}

const SMOOTHING_WINDOW = 30
const MIN_VALID_FRACTION = 0.8

/** Heart rate at sample i if usable, else NaN. */
function usableHeartRate(activity: Activity, validHeartRate: Uint8Array, i: number): number {
  const hr = activity.heartRate[i]!
  return validHeartRate[i] === 1 && Number.isFinite(hr) ? hr : NaN
}

/**
 * Highest sustained heart rate on file. Each activity's usable heart rate is smoothed with a
 * centred 30-sample mean, and only samples whose window is at least 80% usable count. The
 * validity test uses the same window as rollingMean, which spans 31 samples for a window of 30.
 */
export function maxHeartRate(sources: HeartRateSource[]): number | null {
  let best: number | null = null
  for (const { activity, validHeartRate } of sources) {
    if (!activity.hasHeartRate) continue
    const n = activity.n
    const hr = new Float64Array(n)
    const usable = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const value = usableHeartRate(activity, validHeartRate, i)
      hr[i] = value
      usable[i] = Number.isNaN(value) ? 0 : 1
    }
    const smoothed = rollingMean(hr, SMOOTHING_WINDOW)
    const usableFraction = rollingMean(usable, SMOOTHING_WINDOW)
    for (let i = 0; i < n; i++) {
      const value = smoothed[i]!
      if (usableFraction[i]! < MIN_VALID_FRACTION || !Number.isFinite(value)) continue
      if (best === null || value > best) best = value
    }
  }
  return best
}

/**
 * Mean usable heart rate over [startIndex, startIndex + durationS), or null when the activity has
 * no heart rate, the window is out of bounds, or fewer than 80% of its samples are usable.
 */
export function windowHeartRate(
  source: HeartRateSource,
  startIndex: number,
  durationS: number,
): number | null {
  const { activity, validHeartRate } = source
  if (!activity.hasHeartRate) return null
  if (!Number.isInteger(startIndex) || startIndex < 0) return null
  if (!Number.isInteger(durationS) || durationS <= 0) return null
  const end = startIndex + durationS
  if (end > activity.n) return null
  let sum = 0
  let count = 0
  for (let i = startIndex; i < end; i++) {
    const hr = usableHeartRate(activity, validHeartRate, i)
    if (Number.isNaN(hr)) continue
    sum += hr
    count++
  }
  if (count / durationS < MIN_VALID_FRACTION) return null
  return sum / count
}

/** A curve point that also carries the mean heart rate over the window it was taken from. */
export interface EffortPoint extends CurvePoint {
  /** Mean usable heart rate over the window, or null when unknown. */
  heartRate: number | null
}

function findPoint(curve: EffortPoint[], durationS: number): EffortPoint | undefined {
  return curve.find((p) => p.durationS === durationS)
}

export function heartRateFraction(
  point: EffortPoint | undefined,
  maxHr: number | null,
): number | null {
  if (maxHr === null || !(maxHr > 0) || point === undefined) return null
  if (Number.isNaN(point.value) || point.activityId === null || point.heartRate === null) {
    return null
  }
  return point.heartRate / maxHr
}

/**
 * Reference maxima from the highest sustained heart rate of each sport. Running is at least as high
 * as cycling for nearly everyone, so the running reference is the higher of the two. Cycling is
 * the higher of its own maximum and the running maximum less RIDE_MAX_OFFSET_BPM, so an athlete
 * who rarely rode hard is not judged against an artificially low cycling maximum.
 */
export function referenceMaxHeartRates(
  runMax: number | null,
  rideMax: number | null,
): MaxHeartRates {
  return {
    run: highest(runMax, rideMax),
    ride: highest(rideMax, runMax === null ? null : runMax - RIDE_MAX_OFFSET_BPM),
  }
}

function highest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

/** One check per requested duration, in the order given. `reference` says what each reference can certify and where it is from. */
export function checkEfforts(
  runCurve: EffortPoint[],
  rideCurve: EffortPoint[],
  maxHr: MaxHeartRates,
  durations: readonly number[],
  reference: Pick<EffortReference, 'reading' | 'source'>,
): EffortCheck[] {
  const { reading, source } = reference
  return durations.map((durationS) => ({
    durationS,
    runHrFraction: heartRateFraction(findPoint(runCurve, durationS), maxHr.run),
    rideHrFraction: heartRateFraction(findPoint(rideCurve, durationS), maxHr.ride),
    runReference: reading.run,
    rideReference: reading.ride,
    runReferenceSource: source.run,
    rideReferenceSource: source.ride,
  }))
}

export function isSubmaximal(fraction: number | null): boolean {
  return fraction !== null && fraction < ALL_OUT_FRACTION
}

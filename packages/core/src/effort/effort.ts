import { rollingMean } from '../math'
import type { Activity, Curve, CurvePoint, EffortCheck } from '../types'

export interface HeartRateSource {
  activity: Activity
  validHeartRate: Uint8Array
}

/** At or above this fraction of max heart rate, a 5 minute or longer effort is close to all-out. */
export const ALL_OUT_FRACTION = 0.9

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

function findPoint(curve: Curve, durationS: number): CurvePoint | undefined {
  return curve.find((p) => p.durationS === durationS)
}

function heartRateFraction(
  point: CurvePoint | undefined,
  sourcesById: Map<string, HeartRateSource>,
  maxHr: number | null,
): number | null {
  if (maxHr === null || !(maxHr > 0) || point === undefined) return null
  if (Number.isNaN(point.value) || point.activityId === null) return null
  const source = sourcesById.get(point.activityId)
  if (source === undefined) return null
  // After monotone-envelope processing point.durationS can be shorter than the window it was
  // copied from, so the window is always point.durationS long from point.startIndex.
  const hr = windowHeartRate(source, point.startIndex, point.durationS)
  return hr === null ? null : hr / maxHr
}

/** One check per requested duration, in the order given. */
export function checkEfforts(
  runCurve: Curve,
  rideCurve: Curve,
  sourcesById: Map<string, HeartRateSource>,
  maxHr: number | null,
  durations: readonly number[],
): EffortCheck[] {
  return durations.map((durationS) => ({
    durationS,
    runHrFraction: heartRateFraction(findPoint(runCurve, durationS), sourcesById, maxHr),
    rideHrFraction: heartRateFraction(findPoint(rideCurve, durationS), sourcesById, maxHr),
  }))
}

export function isSubmaximal(fraction: number | null): boolean {
  return fraction !== null && fraction < ALL_OUT_FRACTION
}

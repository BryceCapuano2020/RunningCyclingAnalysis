import type { Curve, CurvePoint } from '../types'

/**
 * Best mean of `values` over any window of exactly d consecutive samples in which every sample
 * is valid (valid = 1) and finite, for each duration d in whole seconds. Runs in O(n) per
 * duration using prefix sums and a prefix count of unusable samples.
 */
export function meanMaximal(
  values: Float64Array,
  valid: Uint8Array,
  durations: readonly number[],
  activityId: string,
): Curve {
  const n = values.length
  const sum = new Float64Array(n + 1)
  const bad = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    const usable = valid[i] === 1 && Number.isFinite(v)
    sum[i + 1] = sum[i]! + (usable ? v : 0)
    bad[i + 1] = bad[i]! + (usable ? 0 : 1)
  }
  return durations.map((d) => bestWindow(d, n, sum, bad, activityId))
}

function bestWindow(
  d: number,
  n: number,
  sum: Float64Array,
  bad: Int32Array,
  activityId: string,
): CurvePoint {
  const none: CurvePoint = { durationS: d, value: NaN, activityId: null, startIndex: -1 }
  if (!Number.isInteger(d) || d < 1 || d > n) return none
  let best = NaN
  let bestStart = -1
  for (let i = 0; i + d <= n; i++) {
    if (bad[i + d]! - bad[i]! > 0) continue
    const mean = (sum[i + d]! - sum[i]!) / d
    if (bestStart === -1 || mean > best) {
      best = mean
      bestStart = i
    }
  }
  if (bestStart === -1) return none
  return { durationS: d, value: best, activityId, startIndex: bestStart }
}

import type { Curve, CurvePoint } from '../types'

/** A window counts only when at least minFraction of its samples are 1 in `moving`. */
export interface Occupancy {
  moving: Uint8Array
  minFraction: number
}

export interface MeanMaximalOptions {
  /** The first sample a window may start at. Default 0. */
  firstStart?: number
  /** The share of a window that must be moving. Default none. */
  occupancy?: Occupancy
}

/**
 * Best mean of `values` over any window of exactly d consecutive samples in which every sample
 * is valid (valid = 1) and finite, for each duration d in whole seconds. Runs in O(n) per
 * duration using prefix sums and a prefix count of unusable samples. With `firstStart`, only windows
 * that start at that sample or later are considered. With `occupancy`, a window must also be mostly
 * moving: a stretch that is mostly stopped is not an effort of its length, whatever its mean.
 */
export function meanMaximal(
  values: Float64Array,
  valid: Uint8Array,
  durations: readonly number[],
  activityId: string,
  { firstStart = 0, occupancy }: MeanMaximalOptions = {},
): Curve {
  const n = values.length
  const sum = new Float64Array(n + 1)
  const bad = new Int32Array(n + 1)
  const moving = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    const usable = valid[i] === 1 && Number.isFinite(v)
    sum[i + 1] = sum[i]! + (usable ? v : 0)
    bad[i + 1] = bad[i]! + (usable ? 0 : 1)
    moving[i + 1] = moving[i]! + (occupancy === undefined || occupancy.moving[i] === 1 ? 1 : 0)
  }
  const minFraction = occupancy?.minFraction ?? 0
  return durations.map((d) =>
    bestWindow(
      d,
      n,
      { sum, bad, moving, minMoving: Math.ceil(minFraction * d - 1e-9) },
      activityId,
      firstStart,
    ),
  )
}

/** The prefix sums a window is read from. */
interface Prefix {
  sum: Float64Array
  bad: Int32Array
  moving: Int32Array
  /** The fewest moving samples a window of this duration may hold. */
  minMoving: number
}

function bestWindow(
  d: number,
  n: number,
  { sum, bad, moving, minMoving }: Prefix,
  activityId: string,
  firstStart: number,
): CurvePoint {
  const none: CurvePoint = { durationS: d, value: NaN, activityId: null, startIndex: -1 }
  if (!Number.isInteger(d) || d < 1 || d > n) return none
  let best = NaN
  let bestStart = -1
  for (let i = firstStart; i + d <= n; i++) {
    if (bad[i + d]! - bad[i]! > 0 || moving[i + d]! - moving[i]! < minMoving) continue
    const mean = (sum[i + d]! - sum[i]!) / d
    if (bestStart === -1 || mean > best) {
      best = mean
      bestStart = i
    }
  }
  if (bestStart === -1) return none
  return { durationS: d, value: best, activityId, startIndex: bestStart }
}

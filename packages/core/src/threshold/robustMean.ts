import { BIWEIGHT_C, BIWEIGHT_ITERATIONS, MAD_TO_SD, MIN_SCALE_SHARE } from './constants'
import type { Weighted } from './stats'

export interface RobustMean {
  value: number
  /**
   * The relative error of the mean, 1 / sqrt(sum of weights). It reads as one only where each weight is the inverse
   * square of that point's relative error, as the callers make them.
   */
  relativeError: number
  /** The final weight of each input, in the order given: 0 for a value the mean threw out. */
  weights: number[]
  /** How many inputs had a positive weight to begin with. */
  of: number
}

/**
 * Buffers the routines below work in, kept between calls: a window calls them a few times, and its arrays were most of the
 * garbage a library's weeks made. They grow to the largest call and are never returned to a caller, which is why none of this
 * may call itself or be called from a callback.
 */
const scratch = {
  size: 0,
  live: new Uint32Array(0),
  v: new Float64Array(0),
  w: new Float64Array(0),
  dev: new Float64Array(0),
  a: new Float64Array(0),
  b: new Float64Array(0),
  cv: new Float64Array(0),
  cw: new Float64Array(0),
}

function room(n: number): void {
  if (n <= scratch.size) return
  const size = Math.max(n, scratch.size * 2, 64)
  scratch.size = size
  scratch.live = new Uint32Array(size)
  for (const key of ['v', 'w', 'dev', 'a', 'b', 'cv', 'cw'] as const)
    scratch[key] = new Float64Array(size)
}

/**
 * The smallest value at which the weights of the values at or under it add up to half their total: the weighted median. Found
 * by selection, as a median is, not by sorting: each round splits what is left round a pivot into under, equal and over, and
 * keeps the part that holds the half-way weight, so a window costs a few passes over its values and not a sort of them.
 */
function weightedMedianOf(values: Float64Array, weights: Float64Array, n: number): number {
  const v = scratch.cv
  const w = scratch.cw
  let total = 0
  for (let i = 0; i < n; i++) {
    v[i] = values[i]!
    w[i] = weights[i]!
    total += w[i]!
  }
  const half = total / 2
  let lo = 0
  let hi = n - 1
  // The weight of everything before `lo`, all under the answer, and under half the total.
  let before = 0
  while (lo < hi) {
    const a = v[lo]!
    const b = v[(lo + hi) >> 1]!
    const c = v[hi]!
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b
    // Three-way split of [lo, hi] into under (lo..lt-1), equal (lt..i-1) and over (gt+1..hi) the pivot.
    let lt = lo
    let gt = hi
    let i = lo
    let under = 0
    let equal = 0
    while (i <= gt) {
      const x = v[i]!
      if (x < pivot) {
        under += w[i]!
        swap(v, w, i++, lt++)
      } else if (x > pivot) swap(v, w, i, gt--)
      else equal += w[i++]!
    }
    if (before + under >= half) hi = lt - 1
    else if (before + under + equal >= half) return pivot
    else {
      before += under + equal
      lo = gt + 1
    }
  }
  return v[lo]!
}

function swap(v: Float64Array, w: Float64Array, i: number, j: number): void {
  const x = v[i]!
  v[i] = v[j]!
  v[j] = x
  const y = w[i]!
  w[i] = w[j]!
  w[j] = y
}

/**
 * A weighted mean that gives no say to a value far from the rest: a Tukey biweight, started at the weighted median, with
 * the scale from the weighted median absolute deviation (never under 2% of the centre) and six passes. One wild value
 * falls outside the cut-off and counts for nothing; a cluster of values near each other keeps its weight.
 * Inputs that are not positive and finite, or have no weight, are left out. The inputs are parallel arrays, `count` long.
 * The final weight of each input is returned only when `keepWeights` asks for it.
 */
export function robustMeanOf(
  values: ArrayLike<number>,
  weights: ArrayLike<number>,
  count = values.length,
  keepWeights = false,
): (Omit<RobustMean, 'weights'> & { weights: Float64Array | null }) | null {
  room(count)
  const { live, v, w, dev } = scratch
  let n = 0
  for (let i = 0; i < count; i++) {
    const value = values[i]!
    const weight = weights[i]!
    if (weight > 0 && Number.isFinite(value) && value > 0) {
      live[n] = i
      v[n] = value
      w[n++] = weight
    }
  }
  if (n === 0) return null
  let centre = weightedMedianOf(v, w, n)
  for (let k = 0; k < n; k++) dev[k] = Math.abs(v[k]! - centre)
  const deviation = weightedMedianOf(dev, w, n)
  const scale = Math.max(MAD_TO_SD * deviation, MIN_SCALE_SHARE * centre)
  const cutoff = BIWEIGHT_C * scale
  let kept = w
  let next = scratch.a
  for (let pass = 0; pass < BIWEIGHT_ITERATIONS; pass++) {
    let total = 0
    for (let k = 0; k < n; k++) {
      const u = (v[k]! - centre) / cutoff
      const t = 1 - u * u
      next[k] = Math.abs(u) >= 1 ? 0 : w[k]! * (t * t)
      total += next[k]!
    }
    if (!(total > 0)) break
    // The weights kept so far and the ones just made trade places, neither of them the inputs `w` after the first pass.
    const spare = kept === w ? scratch.b : kept
    kept = next
    next = spare
    let sum = 0
    for (let k = 0; k < n; k++) sum += v[k]! * kept[k]!
    centre = sum / total
  }
  let total = 0
  for (let k = 0; k < n; k++) total += kept[k]!
  let out: Float64Array | null = null
  if (keepWeights) {
    out = new Float64Array(count)
    for (let k = 0; k < n; k++) out[live[k]!] = kept[k]!
  }
  return { value: centre, relativeError: 1 / Math.sqrt(total), weights: out, of: n }
}

/** `robustMeanOf` for a list of points. */
export function robustMean(points: readonly Weighted[]): RobustMean | null {
  const mean = robustMeanOf(
    points.map((p) => p.value),
    points.map((p) => p.weight),
    points.length,
    true,
  )
  return mean === null ? null : { ...mean, weights: Array.from(mean.weights!) }
}

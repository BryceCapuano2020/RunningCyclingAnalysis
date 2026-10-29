import type { LinearFit } from './types'

/**
 * Absorbs floating-point rounding, as an absolute amount, where a value sits on an edge: a zone edge
 * on a bin edge such as 0.3 m/s, a product that is a whole number such as 0.6 * 200, a share of a
 * window that is a whole number of seconds, a run ending exactly on a whole unit.
 */
export const EDGE_EPSILON = 1e-9

/** Deterministic PRNG returning uniform values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal draw (Box-Muller) from a uniform source. */
export function normal(rand: () => number): number {
  const u = Math.max(rand(), Number.MIN_VALUE)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/** Normal draw rejected until it falls inside [min, max]. */
export function truncatedNormal(
  rand: () => number,
  center: number,
  sd: number,
  min: number,
  max: number,
): number {
  for (let i = 0; i < 1000; i++) {
    const x = center + sd * normal(rand)
    if (x >= min && x <= max) return x
  }
  return Math.min(max, Math.max(min, center))
}

export function mean(xs: ArrayLike<number>): number {
  if (xs.length === 0) return NaN
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]!
  return s / xs.length
}

/** Linear-interpolated quantile, q in [0, 1]. Ignores nothing: caller removes NaN. */
export function quantile(xs: ArrayLike<number>, q: number): number {
  if (xs.length === 0) return NaN
  return quantileSorted(Float64Array.from(xs).sort(), q)
}

/** `quantile` of values already sorted ascending, so several quantiles of one set sort it once. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

/**
 * The median, equal to `quantile(values, 0.5)` but found by selection in place rather than by sorting a
 * copy, so the order of `values` is lost. Quickselect runs in linear time on average. Values must not be NaN.
 */
export function medianInPlace(values: Float64Array): number {
  const n = values.length
  if (n === 0) return NaN
  const lo = (n - 1) >> 1
  const below = selectInPlace(values, lo)
  if (n % 2 === 1) return below
  // The next rank up is the smallest value right of the selected one.
  let above = values[lo + 1]!
  for (let i = lo + 2; i < n; i++) if (values[i]! < above) above = values[i]!
  return below + (above - below) * 0.5
}

/** Rearranges `values` so index k holds its k-th smallest, smaller ones before it and larger after. */
function selectInPlace(values: Float64Array, k: number): number {
  let left = 0
  let right = values.length - 1
  while (left < right) {
    // Median of three keeps sorted and reverse-sorted input linear.
    const mid = (left + right) >> 1
    const a = values[left]!
    const b = values[mid]!
    const c = values[right]!
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b
    let i = left
    let j = right
    while (i <= j) {
      while (values[i]! < pivot) i++
      while (values[j]! > pivot) j--
      if (i <= j) {
        const swap = values[i]!
        values[i] = values[j]!
        values[j] = swap
        i++
        j--
      }
    }
    if (k <= j) right = j
    else if (k >= i) left = i
    else break
  }
  return values[k]!
}

/** Ordinary least squares y = intercept + slope * x. Needs at least 3 points. */
export function linearRegression(x: ArrayLike<number>, y: ArrayLike<number>): LinearFit | null {
  const n = Math.min(x.length, y.length)
  if (n < 3) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += x[i]!
    sy += y[i]!
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx
    const dy = y[i]! - my
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const sse = Math.max(0, syy - slope * sxy)
  const r2 = syy === 0 ? 1 : 1 - sse / syy
  const slopeSe = Math.sqrt(sse / (n - 2) / sxx)
  return { slope, intercept, slopeSe, r2, n }
}

/**
 * Centred moving average that skips NaN; NaN when the window is all NaN. The window is symmetric,
 * floor(window / 2) samples each side, so an even `window` spans window + 1 samples.
 */
export function rollingMean(xs: ArrayLike<number>, window: number): Float64Array {
  const n = xs.length
  const out = new Float64Array(n)
  const half = Math.floor(window / 2)
  const sum = new Float64Array(n + 1)
  const cnt = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const v = xs[i]!
    const ok = !Number.isNaN(v)
    sum[i + 1] = sum[i]! + (ok ? v : 0)
    cnt[i + 1] = cnt[i]! + (ok ? 1 : 0)
  }
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n, i + half + 1)
    const c = cnt[hi]! - cnt[lo]!
    out[i] = c === 0 ? NaN : (sum[hi]! - sum[lo]!) / c
  }
  return out
}

/** Throws a RangeError unless value is a positive finite number. name says which input it is. */
export function requirePositiveFinite(name: string, value: number): void {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
}

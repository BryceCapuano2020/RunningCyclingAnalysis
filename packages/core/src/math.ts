import type { LinearFit } from './types'

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
  const sorted = Float64Array.from(xs).sort()
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
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

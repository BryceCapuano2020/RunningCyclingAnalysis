import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '../constants'
import { linearRegression, mean } from '../math'
import type { Curve, CriticalPowerFit } from '../types'

/** Fewest points for which the standard error of cp has a residual degree of freedom. */
const MIN_POINTS = 4

/**
 * Fits value = cp + wPrime / durationS by ordinary least squares of value on x = 1 / durationS.
 * Uses points with minS <= durationS <= maxS (defaults CP_FIT_MIN_S and CP_FIT_MAX_S) and a finite
 * value. Returns null with fewer than 4 points, zero spread in x, equal values, wPrime < 0, or cp <= 0.
 */
export function fitCriticalPower(
  curve: Curve,
  opts?: { minS?: number; maxS?: number },
): CriticalPowerFit | null {
  const { minS = CP_FIT_MIN_S, maxS = CP_FIT_MAX_S } = opts ?? {}
  const points = curve.filter(
    (p) =>
      p.durationS > 0 && p.durationS >= minS && p.durationS <= maxS && Number.isFinite(p.value),
  )
  if (points.length < MIN_POINTS) return null
  const xs = points.map((p) => 1 / p.durationS)
  const ys = points.map((p) => p.value)
  if (ys.every((y) => y === ys[0])) return null
  const fit = linearRegression(xs, ys)
  if (fit === null) return null
  const { intercept: cp, slope: wPrime, r2, n } = fit
  if (wPrime < 0 || cp <= 0) return null

  const meanX = mean(xs)
  let sxx = 0
  let sse = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i]!
    const residual = ys[i]! - (cp + wPrime * x)
    sxx += (x - meanX) ** 2
    sse += residual * residual
  }
  const cpSe = Math.sqrt((sse / (n - 2)) * (1 / n + (meanX * meanX) / sxx))
  return { cp, wPrime, cpSe, r2, nPoints: n }
}

/** Predicted value at durationS from a critical power fit. */
export function predictCritical(fit: CriticalPowerFit, durationS: number): number {
  return fit.cp + fit.wPrime / durationS
}

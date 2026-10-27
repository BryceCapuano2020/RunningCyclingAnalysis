import {
  CP_FIT_MAX_S,
  CP_FIT_MIN_S,
  CP_FIT_REACH_TOLERANCE,
  D_PRIME_FLOOR_M,
  FLAT_RUN_COST,
  PRIORS,
  W_PRIME_FLOOR_J,
} from '../constants'
import { linearRegression, mean } from '../math'
import type { Curve, CurvePoint, CriticalPowerFit, CriticalPowerRefusal, Sport } from '../types'

/** Fewest points for which the standard error of cp has a residual degree of freedom. */
const MIN_POINTS = 4

export interface CriticalPowerOptions {
  minS?: number
  maxS?: number
  /** The least work capacity the fit may show, in the unit of its curve. Defaults to none. */
  minWPrime?: number
}

/** A fit, or the reason there is none. */
export interface CriticalPowerOutcome {
  fit: CriticalPowerFit | null
  refusal: CriticalPowerRefusal | null
}

/** Efforts in the window: finite values with minS <= durationS <= maxS. */
function windowPoints(curve: Curve, minS: number, maxS: number): CurvePoint[] {
  return curve.filter(
    (p) =>
      p.durationS > 0 && p.durationS >= minS && p.durationS <= maxS && Number.isFinite(p.value),
  )
}

/**
 * Least squares of value on x = 1 / durationS, with the standard error of the intercept. Null when x
 * does not vary, which is when every effort has one duration.
 */
function regress(points: CurvePoint[]): CriticalPowerFit | null {
  const xs = points.map((p) => 1 / p.durationS)
  const ys = points.map((p) => p.value)
  const fit = linearRegression(xs, ys)
  if (fit === null) return null
  const { intercept: cp, slope: wPrime, r2, n } = fit
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

/**
 * The least work capacity a fit may show, in the unit of its curve: running curves are J per kg, and
 * cycling curves are metabolic W/kg at the prior-mean efficiency, so the cycling floor is the 3 kJ of
 * mechanical work converted at that efficiency and the athlete's mass. The mass cancels against the
 * fitted work, so a ride's decision does not depend on it.
 */
export function wPrimeFloor(sport: Sport, massKg: number): number {
  return {
    run: D_PRIME_FLOOR_M * FLAT_RUN_COST,
    ride: W_PRIME_FLOOR_J / (PRIORS.grossEfficiency.mean * massKg),
  }[sport]
}

/**
 * The fit with its refusal, and the reasons: the window must reach its longest effort, so the intercept
 * is not read from short efforts alone; the efforts must not be flat; cp must be positive and below the
 * lowest effort in the window, since a threshold cannot be faster than an effort it was fitted to; and
 * W' must reach opts.minWPrime. A fit that passes every rule has no refusal.
 */
export function criticalPowerOutcome(
  curve: Curve,
  opts: CriticalPowerOptions = {},
): CriticalPowerOutcome {
  const maxS = opts.maxS ?? CP_FIT_MAX_S
  const points = windowPoints(curve, opts.minS ?? CP_FIT_MIN_S, maxS)
  const refused = (refusal: CriticalPowerRefusal): CriticalPowerOutcome => ({ fit: null, refusal })
  if (points.length < MIN_POINTS) return refused('missing')
  const longest = Math.max(...points.map((p) => p.durationS))
  if (longest < maxS * (1 - CP_FIT_REACH_TOLERANCE)) return refused('missing')
  const fit = regress(points)
  if (fit === null) return refused('missing')
  const lowest = Math.min(...points.map((p) => p.value))
  const { cp, wPrime } = fit
  if (wPrime < 0 || cp <= 0 || cp >= lowest) return refused('shape')
  // The floor on W' and the test of cp against the lowest effort are both hard lines, so a fit close
  // to either can be kept or refused on a small difference. Both stay as they are: a fit kept near them
  // shows a threshold close to the best 20 minutes, which is honest about what was held.
  if (wPrime < (opts.minWPrime ?? 0)) return refused('shape')
  return { fit, refusal: null }
}

/**
 * Fits value = cp + wPrime / durationS by ordinary least squares of value on x = 1 / durationS, over
 * the window (defaults CP_FIT_MIN_S to CP_FIT_MAX_S). Null when criticalPowerOutcome refuses it.
 */
export function fitCriticalPower(
  curve: Curve,
  opts?: CriticalPowerOptions,
): CriticalPowerFit | null {
  return criticalPowerOutcome(curve, opts).fit
}

/**
 * The fit as it stood before any refusal: the least squares of the window, refused only when there
 * are too few efforts, every effort is equal, or wPrime or cp is negative. Heart rate is cut with it,
 * so refusing a threshold for display never changes the heart-rate check.
 */
export function fitCriticalPowerUnchecked(
  curve: Curve,
  opts: CriticalPowerOptions = {},
): CriticalPowerFit | null {
  const points = windowPoints(curve, opts.minS ?? CP_FIT_MIN_S, opts.maxS ?? CP_FIT_MAX_S)
  if (points.length < MIN_POINTS) return null
  if (points.every((p) => p.value === points[0]!.value)) return null
  const fit = regress(points)
  if (fit === null || fit.wPrime < 0 || fit.cp <= 0) return null
  return fit
}

/** Predicted value at durationS from a critical power fit. */
export function predictCritical(fit: CriticalPowerFit, durationS: number): number {
  return fit.cp + fit.wPrime / durationS
}

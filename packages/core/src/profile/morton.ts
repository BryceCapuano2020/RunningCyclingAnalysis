import { PROFILE_DROP_FRACTION } from './constants'
import { predictionSd, withSpreadAtLeast } from './predictionSd'
import type { PredictionSd } from './predictionSd'

/** A fitted curve: the value it predicts for a best held for a duration, s. */
export type Predict = (durationS: number) => number

export interface FitPoint {
  durationS: number
  value: number
}

/** The two coefficients a curve is linear in, once its shape is fixed. */
type Pair = readonly [number, number]

/**
 * The data of one fit as columns, which the fit reads without allocating: the durations, the values, and
 * their natural logs.
 */
interface Columns {
  t: Float64Array
  y: Float64Array
  ly: Float64Array
}

/** The shortest and longest time constant, s, tried for Morton's curve: W' / (Pmax - CP). */
const SHAPE_MIN_S = 1
const SHAPE_MAX_S = 600
/** A coarse grid on a log scale, which the golden-section search then refines to a few thousandths. */
const SHAPE_GRID = 13
const GOLDEN_STEPS = 12
const GAUSS_NEWTON_STEPS = 4
const GOLDEN = (Math.sqrt(5) - 1) / 2
/** A normal matrix whose determinant is this small a fraction of its diagonal product is singular. */
const SINGULAR = 1e-12

/**
 * Solves the 2 by 2 normal equations with the entries given, or null when the terms are collinear:
 * a and c are the sums of the squares of the two terms, b of their product, and p and q of each with the
 * target.
 */
function solveTwo(a: number, b: number, c: number, p: number, q: number): Pair | null {
  const det = a * c - b * b
  if (!(Math.abs(det) > SINGULAR * a * c)) return null
  return [(c * p - b * q) / det, (a * q - b * p) / det]
}

/** The sum of squared differences of ln y and ln of the curve x1 * t0 + x2 * t1; NaN when it is not above 0. */
function logSse(x1: Float64Array, x2: Float64Array, cols: Columns, t0: number, t1: number): number {
  let sum = 0
  for (let i = 0; i < cols.y.length; i++) {
    sum += (cols.ly[i]! - Math.log(x1[i]! * t0 + x2[i]! * t1)) ** 2
  }
  return sum
}

interface Solved {
  theta: Pair
  sse: number
}

/** The weighted fit with weights 1 / y squared, which is the log fit to first order. */
function startingFit(x1: Float64Array, x2: Float64Array, y: Float64Array): Pair | null {
  let a = 0
  let b = 0
  let c = 0
  let p = 0
  let q = 0
  for (let i = 0; i < y.length; i++) {
    const w = 1 / (y[i]! * y[i]!)
    a += w * x1[i]! * x1[i]!
    b += w * x1[i]! * x2[i]!
    c += w * x2[i]! * x2[i]!
    p += w * x1[i]! * y[i]!
    q += w * x2[i]! * y[i]!
  }
  return solveTwo(a, b, c, p, q)
}

/** One Gauss-Newton step on the logs from `theta`: the change to add, or null when it is singular. */
function gaussNewtonStep(
  x1: Float64Array,
  x2: Float64Array,
  cols: Columns,
  theta: Pair,
): Pair | null {
  let a = 0
  let b = 0
  let c = 0
  let p = 0
  let q = 0
  for (let i = 0; i < cols.y.length; i++) {
    const fitted = x1[i]! * theta[0] + x2[i]! * theta[1]
    const j1 = x1[i]! / fitted
    const j2 = x2[i]! / fitted
    const residual = cols.ly[i]! - Math.log(fitted)
    a += j1 * j1
    b += j1 * j2
    c += j2 * j2
    p += j1 * residual
    q += j2 * residual
  }
  return solveTwo(a, b, c, p, q)
}

/**
 * Least squares on the natural log of the values, for a curve whose two terms are the columns x1 and x2.
 * It starts from the weighted fit and takes a few Gauss-Newton steps on the logs. Null when no valid
 * coefficients fit.
 */
function solveLog(
  x1: Float64Array,
  x2: Float64Array,
  cols: Columns,
  valid: (theta: Pair) => boolean,
): Solved | null {
  let theta = startingFit(x1, x2, cols.y)
  if (theta === null || !valid(theta)) return null
  let sse = logSse(x1, x2, cols, theta[0], theta[1])
  for (let step = 0; step < GAUSS_NEWTON_STEPS; step++) {
    const delta = gaussNewtonStep(x1, x2, cols, theta)
    if (delta === null) break
    const next: Pair = [theta[0] + delta[0], theta[1] + delta[1]]
    // A curve at or below 0 anywhere makes the sum NaN, which no comparison passes.
    const nextSse = logSse(x1, x2, cols, next[0], next[1])
    if (!valid(next) || !(nextSse < sse)) break
    theta = next
    sse = nextSse
  }
  return { theta, sse }
}

/** The points as columns. */
function columnsOf(points: readonly FitPoint[]): Columns {
  return {
    t: Float64Array.from(points, (p) => p.durationS),
    y: Float64Array.from(points, (p) => p.value),
    ly: Float64Array.from(points, (p) => Math.log(p.value)),
  }
}

/** Morton needs 0 < CP < Pmax. */
const mortonValid = ([cp, pmax]: Pair): boolean => cp > 0 && pmax > cp

/** The two-parameter curve P = CP + W' / t, which needs both positive. */
const hyperbolicValid = ([cp, wPrime]: Pair): boolean => cp > 0 && wPrime > 0

/** A fitted curve, with how far a new best at a duration may sit from it. */
export interface CurveFit {
  predict: Predict
  /** The spread, on the log scale, of a new best at a duration, and the residual's degrees of freedom. */
  sd: PredictionSd
}

function fitHyperbolic(cols: Columns): CurveFit | null {
  const ones = new Float64Array(cols.t.length).fill(1)
  const solved = solveLog(
    ones,
    cols.t.map((t) => 1 / t),
    cols,
    hyperbolicValid,
  )
  if (solved === null) return null
  const [cp, wPrime] = solved.theta
  const predict: Predict = (durationS) => cp + wPrime / durationS
  const gradient = (t: number): number[] => [1 / predict(t), 1 / t / predict(t)]
  const sd = predictionSd(gradient, cols.t, solved.sse)
  return sd === null ? null : { predict, sd }
}

/**
 * Golden-section search for the cheapest log time constant between the grid points either side of `best`,
 * the grid point that costs least. A refined point that costs more than `best`, or has no valid curve (an
 * infinite cost, as when the valid band is narrower than the search), is not kept: `best` is returned.
 * Each step costs one evaluation, since the inner point of one is the outer point of the next.
 */
export function refineShape(
  cost: (logK: number) => number,
  best: number,
  bounds: { lo: number; hi: number; step: number },
): number {
  let from = Math.max(bounds.lo, best - bounds.step)
  let to = Math.min(bounds.hi, best + bounds.step)
  let left = to - GOLDEN * (to - from)
  let right = from + GOLDEN * (to - from)
  let costLeft = cost(left)
  let costRight = cost(right)
  for (let i = 0; i < GOLDEN_STEPS; i++) {
    if (costLeft < costRight) {
      to = right
      right = left
      costRight = costLeft
      left = to - GOLDEN * (to - from)
      costLeft = cost(left)
    } else {
      from = left
      left = right
      costLeft = costRight
      right = from + GOLDEN * (to - from)
      costRight = cost(right)
    }
  }
  const refined = (from + to) / 2
  return cost(refined) <= cost(best) ? refined : best
}

/** The log time constant that fits Morton's curve best: the cheapest of a log grid, refined. Null when none is valid. */
function searchShape(cols: Columns, x1: Float64Array, x2: Float64Array): number | null {
  const cost = (logK: number): number => {
    fillMorton(cols.t, Math.exp(logK), x1, x2)
    return solveLog(x1, x2, cols, mortonValid)?.sse ?? Infinity
  }
  const lo = Math.log(SHAPE_MIN_S)
  const hi = Math.log(SHAPE_MAX_S)
  const step = (hi - lo) / (SHAPE_GRID - 1)
  let best = lo
  let bestCost = Infinity
  for (let i = 0; i < SHAPE_GRID; i++) {
    const c = cost(lo + i * step)
    if (c < bestCost) {
      best = lo + i * step
      bestCost = c
    }
  }
  return bestCost === Infinity ? null : refineShape(cost, best, { lo, hi, step })
}

/** Morton's curve for a time constant k, as the two columns CP and Pmax multiply. */
function fillMorton(t: Float64Array, k: number, x1: Float64Array, x2: Float64Array): void {
  for (let i = 0; i < t.length; i++) {
    x1[i] = t[i]! / (t[i]! + k)
    x2[i] = k / (t[i]! + k)
  }
}

/** Morton (1996): P(t) = CP + W' / (t + W' / (Pmax - CP)), fitted over its time constant. */
function fitMortonCurve(cols: Columns): CurveFit | null {
  const x1 = new Float64Array(cols.t.length)
  const x2 = new Float64Array(cols.t.length)
  const logK = searchShape(cols, x1, x2)
  if (logK === null) return null
  const k = Math.exp(logK)
  fillMorton(cols.t, k, x1, x2)
  const solved = solveLog(x1, x2, cols, mortonValid)
  if (solved === null) return null
  const [cp, pmax] = solved.theta
  const predict: Predict = (t) => (cp * t + pmax * k) / (t + k)
  // The gradient of ln P with respect to CP, Pmax and the time constant.
  const gradient = (t: number): number[] => [
    t / (t + k) / predict(t),
    k / (t + k) / predict(t),
    (t * (pmax - cp)) / ((t + k) ** 2 * predict(t)),
  ]
  const sd = predictionSd(gradient, cols.t, solved.sse)
  return sd === null ? null : { predict, sd }
}

/** Fewest points a fit may rest on: its parameters and one more. */
const MIN_POINTS = { morton: 4, hyperbolic: 3 } as const

/**
 * Fits a curve to bests held for a duration, which are lower bounds. The fit is Morton's three-parameter
 * model, or with `pmax` false the two-parameter hyperbola, which does not infer a maximal power. After a
 * first fit the points more than PROFILE_DROP_FRACTION below it are dropped and the rest are fitted
 * once more, since a best that sits far below the curve is more likely untried than a fact about the
 * athlete. Null when there is no valid fit.
 */
export function fitCurve(points: readonly FitPoint[], pmax: boolean): CurveFit | null {
  const fit = pmax ? fitMortonCurve : fitHyperbolic
  const minimum = pmax ? MIN_POINTS.morton : MIN_POINTS.hyperbolic
  if (points.length < minimum) return null
  const first = fit(columnsOf(points))
  if (first === null) return null
  const kept = points.filter(
    (p) => p.value >= (1 - PROFILE_DROP_FRACTION) * first.predict(p.durationS),
  )
  if (kept.length === points.length || kept.length < minimum) return first
  const refit = fit(columnsOf(kept))
  if (refit === null) return first
  // The points dropped were scatter too, and the curve is judged against the athlete's bests as they are: dropping them
  // must not tighten the spread a best is held to.
  return { predict: refit.predict, sd: withSpreadAtLeast(refit.sd, first.sd.spread) }
}

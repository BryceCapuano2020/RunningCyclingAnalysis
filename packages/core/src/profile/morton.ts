import { PROFILE_DROP_FRACTION } from './constants'

/** A fitted curve: the value it predicts for a best held for a duration, s. */
export type Predict = (durationS: number) => number

export interface FitPoint {
  durationS: number
  value: number
}

/** The two coefficients a curve is linear in, once its shape is fixed. */
type Pair = readonly [number, number]

/** The shortest and longest time constant, s, tried for Morton's curve: W' / (Pmax - CP). */
const SHAPE_MIN_S = 1
const SHAPE_MAX_S = 600
const SHAPE_GRID = 49
const GOLDEN_STEPS = 24
const GAUSS_NEWTON_STEPS = 4
const GOLDEN = (Math.sqrt(5) - 1) / 2
/** A normal matrix whose determinant is this small a fraction of its diagonal product is singular. */
const SINGULAR = 1e-12

/**
 * Solves the weighted least squares of y on two terms, or null when the terms are collinear. The
 * rows are the two terms at each point.
 */
function solveTwo(
  rows: readonly Pair[],
  weights: readonly number[],
  ys: readonly number[],
): Pair | null {
  let a = 0
  let b = 0
  let c = 0
  let p = 0
  let q = 0
  rows.forEach(([x1, x2], i) => {
    const w = weights[i]!
    a += w * x1 * x1
    b += w * x1 * x2
    c += w * x2 * x2
    p += w * x1 * ys[i]!
    q += w * x2 * ys[i]!
  })
  const det = a * c - b * b
  if (!(Math.abs(det) > SINGULAR * a * c)) return null
  return [(c * p - b * q) / det, (a * q - b * p) / det]
}

const dot = ([x1, x2]: Pair, [t1, t2]: Pair): number => x1 * t1 + x2 * t2

function logSse(rows: readonly Pair[], ys: readonly number[], theta: Pair): number {
  let sum = 0
  rows.forEach((row, i) => {
    sum += (Math.log(ys[i]!) - Math.log(dot(row, theta))) ** 2
  })
  return sum
}

interface Solved {
  theta: Pair
  sse: number
}

/**
 * Least squares on the natural log of the values, for a curve linear in two coefficients. It starts from
 * the weighted fit with weights 1 / y squared, which is the log fit to first order, and takes a few
 * Gauss-Newton steps on the logs. Null when no valid coefficients fit.
 */
function solveLog(
  rows: readonly Pair[],
  ys: readonly number[],
  valid: (theta: Pair) => boolean,
): Solved | null {
  let theta = solveTwo(
    rows,
    ys.map((y) => 1 / (y * y)),
    ys,
  )
  if (theta === null || !valid(theta)) return null
  let sse = logSse(rows, ys, theta)
  const ones = ys.map(() => 1)
  for (let step = 0; step < GAUSS_NEWTON_STEPS; step++) {
    const fitted = rows.map((row) => dot(row, theta!))
    const jacobian = rows.map(([x1, x2], i) => [x1 / fitted[i]!, x2 / fitted[i]!] as const)
    const residuals = ys.map((y, i) => Math.log(y) - Math.log(fitted[i]!))
    const delta = solveTwo(jacobian, ones, residuals)
    if (delta === null) break
    const next: Pair = [theta[0] + delta[0], theta[1] + delta[1]]
    if (!valid(next) || rows.some((row) => !(dot(row, next) > 0))) break
    const nextSse = logSse(rows, ys, next)
    if (!(nextSse < sse)) break
    theta = next
    sse = nextSse
  }
  return { theta, sse }
}

/** Morton's curve for a time constant k, as the two terms CP and Pmax multiply. */
const mortonRows = (points: readonly FitPoint[], k: number): Pair[] =>
  points.map(({ durationS: t }) => [t / (t + k), k / (t + k)])

/** Morton needs 0 < CP < Pmax. */
const mortonValid = ([cp, pmax]: Pair): boolean => cp > 0 && pmax > cp

/** The two-parameter curve P = CP + W' / t, which needs both positive. */
const hyperbolicValid = ([cp, wPrime]: Pair): boolean => cp > 0 && wPrime > 0

function fitHyperbolic(points: readonly FitPoint[]): Predict | null {
  const solved = solveLog(
    points.map(({ durationS }): Pair => [1, 1 / durationS]),
    points.map((point) => point.value),
    hyperbolicValid,
  )
  if (solved === null) return null
  const [cp, wPrime] = solved.theta
  return (durationS) => cp + wPrime / durationS
}

/** Morton (1996): P(t) = CP + W' / (t + W' / (Pmax - CP)), fitted over its time constant. */
function fitMortonCurve(points: readonly FitPoint[]): Predict | null {
  const ys = points.map((point) => point.value)
  const cost = (logK: number): number =>
    solveLog(mortonRows(points, Math.exp(logK)), ys, mortonValid)?.sse ?? Infinity
  const lo = Math.log(SHAPE_MIN_S)
  const hi = Math.log(SHAPE_MAX_S)
  const step = (hi - lo) / (SHAPE_GRID - 1)
  let best = 0
  let bestCost = Infinity
  for (let i = 0; i < SHAPE_GRID; i++) {
    const c = cost(lo + i * step)
    if (c < bestCost) {
      best = i
      bestCost = c
    }
  }
  if (bestCost === Infinity) return null
  // Golden-section search between the grid points either side of the best.
  let from = Math.max(lo, lo + (best - 1) * step)
  let to = Math.min(hi, lo + (best + 1) * step)
  for (let i = 0; i < GOLDEN_STEPS; i++) {
    const left = to - GOLDEN * (to - from)
    const right = from + GOLDEN * (to - from)
    if (cost(left) < cost(right)) to = right
    else from = left
  }
  const k = Math.exp((from + to) / 2)
  const solved = solveLog(mortonRows(points, k), ys, mortonValid)
  if (solved === null) return null
  const [cp, pmax] = solved.theta
  return (t) => (cp * t + pmax * k) / (t + k)
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
export function fitCurve(points: readonly FitPoint[], pmax: boolean): Predict | null {
  const fit = pmax ? fitMortonCurve : fitHyperbolic
  const minimum = pmax ? MIN_POINTS.morton : MIN_POINTS.hyperbolic
  if (points.length < minimum) return null
  const first = fit(points)
  if (first === null) return null
  const kept = points.filter((p) => p.value >= (1 - PROFILE_DROP_FRACTION) * first(p.durationS))
  if (kept.length === points.length || kept.length < minimum) return first
  return fit(kept) ?? first
}

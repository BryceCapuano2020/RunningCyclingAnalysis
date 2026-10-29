export interface Changepoint {
  /** The first point of the second segment. */
  index: number
  before: number
  after: number
  /** The share of the series' variation the two means explain: 1 - SSE(two) / SSE(one). */
  gain: number
  /**
   * How much better a step fits than a straight line: SSE(line) / SSE(step). Above 1 the series
   * stepped; near or below 1 it drifted, which a step also fits better than a constant. A ramp's
   * best step has gain but no advantage over its own line.
   */
  stepAdvantage: number
}

/** The squared error of the least-squares line through the points. */
function lineSumSquares(values: readonly number[]): number {
  const n = values.length
  const meanX = (n - 1) / 2
  const meanY = values.reduce((sum, v) => sum + v, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxx += (i - meanX) ** 2
    sxy += (i - meanX) * (values[i]! - meanY)
    syy += (values[i]! - meanY) ** 2
  }
  return Math.max(0, syy - (sxy * sxy) / sxx)
}

function sumSquares(values: readonly number[], from: number, to: number): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += values[i]!
  const mean = sum / (to - from)
  let squares = 0
  for (let i = from; i < to; i++) squares += (values[i]! - mean) ** 2
  return squares
}

/**
 * The one split of a series into two stretches, each at its own mean, that leaves the least squared
 * error; the earliest of equals, equal meaning within a billionth of the series' own squared error.
 * Each stretch keeps at least `minSegment` points. Null when the series is too short for two, or is
 * constant. Used to date a change in a weekly series, such as hours.
 */
export function changepoint(values: readonly number[], minSegment = 3): Changepoint | null {
  const n = values.length
  if (n < 2 * minSegment) return null
  const whole = sumSquares(values, 0, n)
  if (!(whole > 0)) return null
  let best = { index: -1, error: Infinity }
  for (let k = minSegment; k <= n - minSegment; k++) {
    const error = sumSquares(values, 0, k) + sumSquares(values, k, n)
    if (error < best.error - 1e-9 * whole) best = { index: k, error }
  }
  const mean = (from: number, to: number) =>
    values.slice(from, to).reduce((sum, v) => sum + v, 0) / (to - from)
  return {
    index: best.index,
    before: mean(0, best.index),
    after: mean(best.index, n),
    gain: 1 - best.error / whole,
    stepAdvantage: best.error > 0 ? lineSumSquares(values) / best.error : Number.POSITIVE_INFINITY,
  }
}

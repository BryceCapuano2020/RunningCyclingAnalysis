import type { Interval } from '../types'
import { indexOrder } from './indexOrder'

/**
 * The indices of values in ascending order, equal values in index order; with `descending`, the
 * highest value first, equal values still in index order. Equal values keep their index order
 * whichever way the engine sorts, so the order is the same everywhere. NaN has no place in it.
 */
export function sortedOrder(values: ArrayLike<number>, descending = false): number[] {
  return indexOrder(values, values.length, descending)
}

/**
 * Whether order is exactly what `sortedOrder(values)` returns, found in one pass over it. Every entry
 * must be a whole index of values: with every index in range, the strictly increasing pairs of value
 * and index also make the order a permutation.
 */
function isAscendingOrder(values: ArrayLike<number>, order: readonly number[]): boolean {
  const n = values.length
  if (order.length !== n) return false
  for (let k = 0; k < n; k++) {
    const index = order[k]!
    if (!Number.isInteger(index) || index < 0 || index >= n) return false
    if (k === 0) continue
    const before = order[k - 1]!
    const low = values[before]!
    const high = values[index]!
    if (!(low < high || (low === high && before < index))) return false
  }
  return true
}

/**
 * The ascending order of values, taken from `likely` when that is exactly it and sorted otherwise.
 * A value computed from a draw usually moves with the draw, so the order of the draws serves it; a
 * tie or a reversal makes it differ, and then the values are sorted as they would have been.
 */
export function confirmedOrder(
  values: ArrayLike<number>,
  likely: readonly number[],
): readonly number[] {
  return isAscendingOrder(values, likely) ? likely : sortedOrder(values)
}

/**
 * Weighted quantiles read along an order of the values. For each q, returns the first value in
 * that order at which the cumulative weight reaches q times the total weight. NaN when there are
 * no values or the total weight is zero.
 */
export function weightedQuantilesAlong(
  values: ArrayLike<number>,
  weights: ArrayLike<number>,
  order: readonly number[],
  qs: readonly number[],
): number[] {
  const n = order.length
  if (n === 0) return qs.map(() => Number.NaN)
  let total = 0
  for (const i of order) total += weights[i]!
  if (total === 0) return qs.map(() => Number.NaN)
  return qs.map((q) => {
    const target = q * total
    let cumulative = 0
    let value = values[order[n - 1]!]!
    for (const i of order) {
      cumulative += weights[i]!
      if (cumulative >= target) {
        value = values[i]!
        break
      }
    }
    return value
  })
}

/**
 * Weighted quantiles. For each q, returns the first value in ascending order at which the
 * cumulative weight reaches q times the total weight. NaN when there are no values or the total
 * weight is zero.
 */
export function weightedQuantiles(
  values: ArrayLike<number>,
  weights: ArrayLike<number>,
  qs: readonly number[],
): number[] {
  const n = Math.min(values.length, weights.length)
  return weightedQuantilesAlong(values, weights, indexOrder(values, n, false), qs)
}

export function weightedQuantile(
  values: ArrayLike<number>,
  weights: ArrayLike<number>,
  q: number,
): number {
  return weightedQuantiles(values, weights, [q])[0]!
}

const INTERVAL_QS = [0.05, 0.5, 0.95] as const

function intervalOf(q: readonly number[]): Interval {
  return { p05: q[0]!, p50: q[1]!, p95: q[2]! }
}

/** The 5th, 50th and 95th weighted percentiles. */
export function weightedInterval(values: ArrayLike<number>, weights: ArrayLike<number>): Interval {
  return intervalOf(weightedQuantiles(values, weights, INTERVAL_QS))
}

/** The same percentiles read along an order of the values, so one sort can serve several weights. */
export function weightedIntervalAlong(
  values: ArrayLike<number>,
  weights: ArrayLike<number>,
  order: readonly number[],
): Interval {
  return intervalOf(weightedQuantilesAlong(values, weights, order, INTERVAL_QS))
}

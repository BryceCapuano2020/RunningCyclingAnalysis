import type { Interval } from '../types'

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
  if (n === 0) return qs.map(() => Number.NaN)
  const order: number[] = []
  for (let i = 0; i < n; i++) order.push(i)
  order.sort((a, b) => {
    const va = values[a]!
    const vb = values[b]!
    if (va < vb) return -1
    if (va > vb) return 1
    return 0
  })
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

export function weightedQuantile(
  values: ArrayLike<number>,
  weights: ArrayLike<number>,
  q: number,
): number {
  return weightedQuantiles(values, weights, [q])[0]!
}

/** The 5th, 50th and 95th weighted percentiles. */
export function weightedInterval(values: ArrayLike<number>, weights: ArrayLike<number>): Interval {
  const q = weightedQuantiles(values, weights, [0.05, 0.5, 0.95])
  return { p05: q[0]!, p50: q[1]!, p95: q[2]! }
}

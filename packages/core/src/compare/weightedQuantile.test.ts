import { describe, expect, it } from 'vitest'
import {
  confirmedOrder,
  sortedOrder,
  weightedInterval,
  weightedIntervalAlong,
  weightedQuantile,
  weightedQuantiles,
  weightedQuantilesAlong,
} from './weightedQuantile'

describe('weightedQuantile', () => {
  it('returns hand-computed values for weights 1, 1, 2 on values 3, 1, 2', () => {
    // Sorted: 1 (w 1), 2 (w 2), 3 (w 1). Cumulative weight: 1, 3, 4. Total 4.
    const values = [3, 1, 2]
    const weights = [1, 1, 2]
    expect(weightedQuantile(values, weights, 0)).toBe(1)
    expect(weightedQuantile(values, weights, 0.25)).toBe(1)
    expect(weightedQuantile(values, weights, 0.5)).toBe(2)
    expect(weightedQuantile(values, weights, 0.75)).toBe(2)
    expect(weightedQuantile(values, weights, 0.9)).toBe(3)
    expect(weightedQuantile(values, weights, 1)).toBe(3)
  })

  it('takes the first value that reaches the target when there are ties', () => {
    expect(weightedQuantile([5, 5, 7], [1, 1, 1], 0.5)).toBe(5)
    expect(weightedQuantile([5, 5, 7], [1, 1, 1], 0.8)).toBe(7)
  })

  it('follows weight, not position, when heavy values come first', () => {
    // Sorted: 10 (w 3), 20 (w 1). Cumulative: 3, 4. Total 4.
    expect(weightedQuantile([10, 20], [3, 1], 0.5)).toBe(10)
    expect(weightedQuantile([10, 20], [3, 1], 0.8)).toBe(20)
  })

  it('returns NaN for empty input', () => {
    expect(weightedQuantile([], [], 0.5)).toBeNaN()
  })

  it('returns NaN when the total weight is zero', () => {
    expect(weightedQuantile([1, 2], [0, 0], 0.5)).toBeNaN()
  })

  it('computes several quantiles from one sort', () => {
    expect(weightedQuantiles([3, 1, 2], [1, 1, 2], [0.5, 0.9])).toEqual([2, 3])
    expect(weightedQuantiles([], [], [0.5, 0.9])).toEqual([Number.NaN, Number.NaN])
  })

  it('summarises the 5th, 50th and 95th percentiles', () => {
    const values = [1, 2, 3, 4, 5]
    const ones = [1, 1, 1, 1, 1]
    expect(weightedInterval(values, ones)).toEqual({ p05: 1, p50: 3, p95: 5 })
  })

  it('reads quantiles along an order it is given, as it would along its own', () => {
    const values = [3, 1, 2, 2]
    const weights = [1, 1, 2, 1]
    const order = sortedOrder(values)
    expect(order).toEqual([1, 2, 3, 0])
    expect(weightedQuantilesAlong(values, weights, order, [0.2, 0.5, 0.95])).toEqual(
      weightedQuantiles(values, weights, [0.2, 0.5, 0.95]),
    )
    expect(weightedIntervalAlong(values, weights, order)).toEqual(weightedInterval(values, weights))
    // One order serves any weights.
    const other = [0, 0, 1, 5]
    expect(weightedIntervalAlong(values, other, order)).toEqual(weightedInterval(values, other))
  })

  it('returns NaN along an empty order or with no weight', () => {
    expect(weightedQuantilesAlong([], [], [], [0.5])).toEqual([Number.NaN])
    expect(weightedQuantilesAlong([1, 2], [0, 0], [0, 1], [0.5])).toEqual([Number.NaN])
  })
})

describe('sortedOrder', () => {
  it('lists indices from the lowest value, equal values by index', () => {
    expect(sortedOrder([2, 1, 2, 0, 1])).toEqual([3, 1, 4, 0, 2])
    expect(sortedOrder([])).toEqual([])
  })

  it('lists the highest value first when descending, equal values still by index', () => {
    expect(sortedOrder([2, 1, 2, 0, 1], true)).toEqual([0, 2, 1, 4, 3])
  })
})

describe('confirmedOrder', () => {
  it('returns the order it was given when that is the ascending order', () => {
    const likely = [3, 1, 4, 0, 2]
    expect(confirmedOrder([2, 1, 2, 0, 1], likely)).toBe(likely)
  })

  it('sorts when equal values are not in index order', () => {
    // 1 and 4 hold the same value and sit the wrong way round.
    expect(confirmedOrder([2, 1, 2, 0, 1], [3, 4, 1, 0, 2])).toEqual([3, 1, 4, 0, 2])
  })

  it('sorts when the given order runs the wrong way or has the wrong length', () => {
    expect(confirmedOrder([1, 2, 3], [2, 1, 0])).toEqual([0, 1, 2])
    expect(confirmedOrder([1, 2, 3], [0, 1])).toEqual([0, 1, 2])
  })

  it('sorts as the plain sort does when a value is not a number', () => {
    const values = [3, Number.NaN, 1, 2, Number.NaN, 0]
    for (const likely of [sortedOrder(values), sortedOrder(values, true), [0, 1, 2, 3, 4, 5]]) {
      expect(confirmedOrder(values, likely)).toEqual(sortedOrder(values))
    }
  })

  it('takes -0 and 0 as equal, so they stay in index order', () => {
    expect(confirmedOrder([0, -0, 0], [1, 0, 2])).toEqual([0, 1, 2])
  })
})

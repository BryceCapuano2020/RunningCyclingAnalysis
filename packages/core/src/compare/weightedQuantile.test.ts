import { describe, expect, it } from 'vitest'
import { weightedInterval, weightedQuantile, weightedQuantiles } from './weightedQuantile'

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
})

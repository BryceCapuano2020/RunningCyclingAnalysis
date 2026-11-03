import { describe, expect, it } from 'vitest'
import { robustMean } from './robustMean'

const equal = (values: number[]) => values.map((value) => ({ value, weight: 1 }))

describe('the robust mean', () => {
  it('is the plain mean where the values agree', () => {
    const mean = robustMean(equal([99, 100, 101, 100, 100]))!
    expect(mean.value).toBeCloseTo(100, 0)
    expect(mean.weights.every((w) => w > 0)).toBe(true)
  })

  it('ignores a single wild value', () => {
    const mean = robustMean(equal([100, 101, 99, 100, 102, 98, 160]))!
    expect(mean.value).toBeCloseTo(100, 0)
    expect(mean.weights[6]).toBe(0)
    expect(mean.of).toBe(7)
  })

  it('gives a heavier value more say', () => {
    const light = robustMean([
      { value: 100, weight: 1 },
      { value: 104, weight: 1 },
    ])!
    const heavy = robustMean([
      { value: 100, weight: 1 },
      { value: 104, weight: 3 },
    ])!
    expect(heavy.value).toBeGreaterThan(light.value)
  })

  it('reads its relative error as 1 over the root of the weights it kept', () => {
    const mean = robustMean([
      { value: 100, weight: 400 },
      { value: 100, weight: 400 },
    ])!
    expect(mean.relativeError).toBeCloseTo(1 / Math.sqrt(800), 10)
  })

  it('leaves out values with no weight or that are not positive and finite, and keeps the order of the weights', () => {
    const mean = robustMean([
      { value: 100, weight: 1 },
      { value: 500, weight: 0 },
      { value: NaN, weight: 1 },
      { value: -3, weight: 1 },
      { value: 100, weight: 1 },
    ])!
    expect(mean.of).toBe(2)
    expect(mean.weights.map((w) => w > 0)).toEqual([true, false, false, false, true])
  })

  it('is null with nothing to average', () => {
    expect(robustMean([])).toBeNull()
    expect(robustMean([{ value: 100, weight: 0 }])).toBeNull()
  })
})

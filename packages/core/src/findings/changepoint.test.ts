import { describe, expect, it } from 'vitest'
import { changepoint } from './changepoint'

describe('changepoint', () => {
  // Brute force in R over splits k = 3..8 of this series: the least sum of squares is 0.275 at k = 5
  // (the second stretch starts at the sixth point), against 11.73636 for one mean.
  const series = [1.1, 0.9, 1.0, 1.2, 0.8, 3.1, 2.9, 3.2, 3.0, 2.8, 3.3]

  it('finds the split with the least squared error', () => {
    const found = changepoint(series)!
    expect(found.index).toBe(5)
    expect(found.before).toBeCloseTo(1.0, 12)
    expect(found.after).toBeCloseTo(3.05, 12)
    expect(found.gain).toBeCloseTo(1 - 0.275 / 11.73636, 5)
  })

  it('tells a step from a ramp: a step fits far better than its line, a ramp does not', () => {
    // The series above: its best line leaves a squared error of 3.168 (NumPy lstsq) against the step's 0.275, an advantage of 11.5.
    expect(changepoint(series)!.stepAdvantage).toBeCloseTo(3.1682727272727274 / 0.275, 6)
    const ramp = Array.from({ length: 20 }, (_, i) => 0.5 * i + (i % 2 === 0 ? 0.05 : -0.05))
    const found = changepoint(ramp)!
    expect(found.gain).toBeGreaterThan(0.7)
    expect(found.stepAdvantage).toBeLessThan(0.1)
  })

  it('keeps each stretch to at least the minimum, so a spike at the end is not a split', () => {
    const spike = [1, 1, 1, 1, 1, 1, 1, 1, 9]
    expect(changepoint(spike, 3)!.index).toBeLessThanOrEqual(6)
  })

  it("takes the earliest of equal splits, equal to a relative tolerance of the series' own scale", () => {
    expect(changepoint([0, 0, 0, 1, 1, 1], 3)!.index).toBe(3)
    // The same series a million times larger has the same split, not one picked by rounding.
    expect(changepoint([0, 0, 0, 1e6, 1e6, 1e6], 3)!.index).toBe(3)
    expect(changepoint([5, 5, 5, 5, 5, 5, 5, 5, 5 + 1e-13], 3)).not.toBeNull()
  })

  it('has none in a series too short or constant', () => {
    expect(changepoint([1, 2, 3, 4, 5])).toBeNull()
    expect(changepoint([2, 2, 2, 2, 2, 2, 2])).toBeNull()
  })
})

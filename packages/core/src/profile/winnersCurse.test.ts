import { describe, expect, it } from 'vitest'
import { conditionalEstimate } from './winnersCurse'

describe('conditionalEstimate', () => {
  it('is below the draw, far below it near the cut and close to it well past', () => {
    const cut = 3.3
    const near = conditionalEstimate(3.5, cut)
    const mid = conditionalEstimate(4.5, cut)
    const far = conditionalEstimate(7, cut)
    expect(near).toBeLessThan(3.5 - 1)
    expect(mid).toBeLessThan(4.5)
    expect(far).toBeLessThan(7)
    expect(7 - far).toBeLessThan(0.05)
    expect(near).toBeLessThan(mid)
    expect(mid).toBeLessThan(far)
  })

  it('is the inverse of the mean of a normal cut off below the cut', () => {
    // A normal of mean 4 cut off below 3.3 has a mean near 4.1: the estimate of that draw is 4.
    const cut = 3.3
    const mean = 4 + Math.exp(-0.5 * (cut - 4) ** 2) / Math.sqrt(2 * Math.PI) / 0.7580363
    expect(conditionalEstimate(mean, cut)).toBeCloseTo(4, 2)
  })

  it('is far below the cut for a draw at the cut, which a mean of anything lower could have made', () => {
    expect(conditionalEstimate(3.3, 3.3)).toBeLessThan(0)
  })
})

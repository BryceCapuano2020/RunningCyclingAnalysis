import { describe, expect, it } from 'vitest'
import { durationRatio, ratioSpread } from './durationRatio'

describe('the duration ratio', () => {
  it('is the 90% rule at 8 min', () => {
    expect(durationRatio(8 * 60)).toBeCloseTo(1.11, 10)
    expect(1 / durationRatio(8 * 60)).toBeCloseTo(0.9, 2)
  })

  it('is the 95% rule at 20 min', () => {
    expect(durationRatio(20 * 60)).toBeCloseTo(1.053, 10)
    expect(1 / durationRatio(20 * 60)).toBeCloseTo(0.95, 2)
  })

  it('is 1 at 60 min and falls steadily from 3 min to there', () => {
    expect(durationRatio(60 * 60)).toBeCloseTo(1, 10)
    const minutes = [3, 5, 8, 10, 15, 20, 30, 45, 60]
    for (let i = 1; i < minutes.length; i++) {
      expect(durationRatio(minutes[i]! * 60)).toBeLessThan(durationRatio(minutes[i - 1]! * 60))
    }
  })

  it('has no step where the two formulas meet at 20 min', () => {
    expect(Math.abs(durationRatio(1200.001) - durationRatio(1199.999))).toBeLessThan(1e-6)
  })
})

describe('the spread of the ratio between riders', () => {
  it('is smallest at 20 min and grows either side', () => {
    expect(ratioSpread(1200)).toBeCloseTo(0.025, 10)
    expect(ratioSpread(480)).toBeGreaterThan(ratioSpread(1200))
    expect(ratioSpread(3600)).toBeCloseTo(0.025 + 0.02 * Math.log(3), 10)
  })
})

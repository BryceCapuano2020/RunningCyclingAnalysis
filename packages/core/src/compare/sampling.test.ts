import { describe, expect, it } from 'vitest'
import { PRIORS } from '../constants'
import type { HrCrossCheck } from '../types'
import { calibrationWeights, drawPriors } from './sampling'

const hr = (kappa: number, lnKappaSe: number): HrCrossCheck => ({
  run: null,
  ride: null,
  kappa,
  lnKappaSe,
})

describe('calibration sampling', () => {
  const { ge, s } = drawPriors(4000, 1)

  it('uses a finite, supported adjustment for compatible data', () => {
    const result = calibrationWeights(ge, s, hr(1.1, 0.05))!
    expect(result.accepted).toBe(true)
    expect(result.effectiveSamples).toBeGreaterThan(40)
    expect(result.effectiveSamples).toBeLessThanOrEqual(4000)
    expect(Math.max(...result.weights)).toBe(1)
  })

  it('accepts exactly 42 effective draws of 4000, and the 1% floor is 40 draws', () => {
    // Forty-two draws sit exactly on kappa = 1 and the rest are far off, so ESS is 42.
    const ge = new Float64Array(4000).fill(0.2)
    const s = new Float64Array(4000).fill(1)
    ge.fill(PRIORS.grossEfficiency.mean, 0, 42)
    const result = calibrationWeights(ge, s, hr(1, 0.001))!
    expect(result.effectiveSamples).toBeCloseTo(42, 6)
    expect(result.accepted).toBe(true)
  })

  it('rejects conflicting evidence rather than using a few draws as a narrow interval', () => {
    for (const kappa of [3, 10]) {
      const result = calibrationWeights(ge, s, hr(kappa, 0.05))!
      expect(result.accepted).toBe(false)
      expect(result.effectiveSamples).toBeLessThan(40)
      expect(result.weights.every(Number.isFinite)).toBe(true)
      // Even the old underflow case keeps a finite maximum after log normalisation.
      expect(Math.max(...result.weights)).toBe(1)
    }
  })

  it('rejects invalid parameters and leaves unavailable data unattempted', () => {
    expect(calibrationWeights(ge, s, null)).toBeNull()
    for (const [kappa, se] of [
      [0, 0.1],
      [-1, 0.1],
      [Infinity, 0.1],
      [1, 0],
      [1, NaN],
    ]) {
      const result = calibrationWeights(ge, s, hr(kappa!, se!))!
      expect(result.accepted).toBe(false)
      expect(result.effectiveSamples).toBe(0)
    }
  })

  it('rejects an empty or invalid simulation', () => {
    for (const draws of [0, -1, 1.5, NaN]) expect(() => drawPriors(draws, 1)).toThrow(/draws/)
  })
})

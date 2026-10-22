import { describe, expect, it } from 'vitest'
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

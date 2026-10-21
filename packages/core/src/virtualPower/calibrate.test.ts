import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL } from '../constants'
import type { CalibrationStats } from './calibrate'
import { solveBikeModel } from './calibrate'

const stats = (
  blocks: number,
  s11: number,
  s12: number,
  s22: number,
  s1y: number,
  s2y: number,
): CalibrationStats => ({ blocks, s11, s12, s22, s1y, s2y })

/**
 * Statistics for blocks whose target is exactly crr * x1 + cda * x2. The x values are chosen so
 * the two columns are not proportional.
 */
function exactStats(crr: number, cda: number, blocks = 40): CalibrationStats {
  let s11 = 0
  let s12 = 0
  let s22 = 0
  let s1y = 0
  let s2y = 0
  for (let k = 0; k < blocks; k++) {
    const x1 = 1 + Math.sin(k * 0.7)
    const x2 = 2 + Math.cos(k * 0.3)
    const y = crr * x1 + cda * x2
    s11 += x1 * x1
    s12 += x1 * x2
    s22 += x2 * x2
    s1y += x1 * y
    s2y += x2 * y
  }
  return stats(blocks, s11, s12, s22, s1y, s2y)
}

describe('solveBikeModel', () => {
  it('recovers the coefficients of exact normal equations', () => {
    const fit = solveBikeModel(exactStats(0.006, 0.35))
    expect(fit.crr).toBeCloseTo(0.006, 12)
    expect(fit.cda).toBeCloseTo(0.35, 12)
  })

  it('clamps crr and cda to their ranges from above and below', () => {
    expect(solveBikeModel(exactStats(0.02, 0.6))).toEqual({ crr: 0.012, cda: 0.5 })
    expect(solveBikeModel(exactStats(0.0005, 0.1))).toEqual({ crr: 0.002, cda: 0.2 })
  })

  it('needs at least 20 blocks', () => {
    expect(solveBikeModel(exactStats(0.006, 0.35, 19))).toEqual(DEFAULT_BIKE_MODEL)
    expect(solveBikeModel(exactStats(0.006, 0.35, 20)).crr).toBeCloseTo(0.006, 12)
  })

  it('falls back to the default model with no blocks', () => {
    expect(solveBikeModel(stats(0, 0, 0, 0, 0, 0))).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('falls back to the default model when singular or non-finite', () => {
    // Rows (1, 1) repeated: det = 0.
    expect(solveBikeModel(stats(25, 25, 25, 25, 25, 25))).toEqual(DEFAULT_BIKE_MODEL)
    expect(solveBikeModel(stats(25, Infinity, 1, 1, 1, 1))).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('falls back when the solution itself is not finite', () => {
    // A non-finite right-hand side gives a non-finite solution.
    expect(solveBikeModel(stats(25, 2, 0, 2, Number.NaN, 1))).toEqual(DEFAULT_BIKE_MODEL)
  })
})

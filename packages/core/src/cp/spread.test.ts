import { describe, expect, it } from 'vitest'
import { MODEL_ERROR_FRACTION, cpSpread } from './spread'

describe('cpSpread', () => {
  it('is the regression error alone only when the model error is nothing', () => {
    expect(cpSpread({ cp: 0, cpSe: 0.3 })).toBe(0.3)
  })

  it('never falls under the model error floor, however well the efforts lie on a line', () => {
    expect(cpSpread({ cp: 16, cpSe: 0 })).toBeCloseTo(16 * MODEL_ERROR_FRACTION)
    expect(cpSpread({ cp: 16, cpSe: 0.001 })).toBeGreaterThan(0.79)
  })

  it('adds the two errors as independent errors are added', () => {
    const floor = 10 * MODEL_ERROR_FRACTION
    expect(cpSpread({ cp: 10, cpSe: floor })).toBeCloseTo(floor * Math.SQRT2)
  })
})

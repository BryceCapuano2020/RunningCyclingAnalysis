import { describe, expect, it } from 'vitest'
import { ALLOWANCE_BASE, ALLOWANCE_PER_SHORTFALL, UNCHECKED_SHARE, cpBand } from './spread'

describe('cpBand', () => {
  const fit = { cp: 16, cpSe: 0.25 }

  it('goes down by the regression error alone', () => {
    expect(cpBand(fit, 0.97).low).toBeCloseTo(15.75)
  })

  it('goes up by an allowance that grows as the effort falls short of the reference', () => {
    const near = cpBand(fit, 1).high
    const hard = cpBand(fit, 0.92).high
    const marginal = cpBand(fit, 0.9).high
    expect(near).toBeCloseTo(16 * (1 + ALLOWANCE_BASE))
    expect(hard).toBeGreaterThan(near)
    expect(marginal).toBeCloseTo(16 * (1 + ALLOWANCE_BASE + ALLOWANCE_PER_SHORTFALL * 0.1))
  })

  it('takes a share over the reference as the reference, and an unchecked effort as the hard line', () => {
    expect(cpBand(fit, 1.1).high).toBe(cpBand(fit, 1).high)
    expect(cpBand(fit, null).high).toBe(cpBand(fit, UNCHECKED_SHARE).high)
  })

  it('is wider above than below for a threshold whose effort was only just hard', () => {
    const { low, high } = cpBand(fit, 0.9)
    expect(high - fit.cp).toBeGreaterThan(fit.cp - low)
  })
})

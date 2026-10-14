import { describe, expect, it } from 'vitest'
import { kgToLb, lbToKg } from './convert'

describe('kgToLb', () => {
  it('converts with 1 lb = 0.45359237 kg', () => {
    expect(kgToLb(1)).toBeCloseTo(2.2046226, 6)
    expect(kgToLb(75)).toBeCloseTo(165.3467, 3)
    expect(kgToLb(0)).toBe(0)
  })
})

describe('lbToKg', () => {
  it('converts with 1 lb = 0.45359237 kg', () => {
    expect(lbToKg(1)).toBe(0.45359237)
    expect(lbToKg(165)).toBeCloseTo(74.84274105, 8)
  })

  it('round-trips with kgToLb', () => {
    expect(kgToLb(lbToKg(165))).toBeCloseTo(165, 10)
    expect(lbToKg(kgToLb(68.5))).toBeCloseTo(68.5, 10)
  })
})

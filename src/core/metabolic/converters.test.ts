import { describe, expect, it } from 'vitest'
import {
  flatSpeedToMetabolic,
  metabolicToFlatSpeed,
  metabolicToRidePower,
  ridePowerToMetabolic,
} from './converters'

describe('flatSpeedToMetabolic', () => {
  it('returns resting rate at zero speed', () => {
    expect(flatSpeedToMetabolic(0)).toBe(1.22)
  })

  it('adds 3.6 J/kg/m times speed to resting rate', () => {
    expect(flatSpeedToMetabolic(4)).toBeCloseTo(15.62, 10)
    expect(flatSpeedToMetabolic(4, 1.1)).toBeCloseTo(17.06, 10)
  })
})

describe('metabolicToFlatSpeed', () => {
  it('inverts flatSpeedToMetabolic', () => {
    expect(metabolicToFlatSpeed(15.62)).toBeCloseTo(4, 10)
    expect(metabolicToFlatSpeed(17.06, 1.1)).toBeCloseTo(4, 10)
  })

  it('returns zero at or below resting rate', () => {
    expect(metabolicToFlatSpeed(1.22)).toBe(0)
    expect(metabolicToFlatSpeed(1)).toBe(0)
  })

  it('round-trips with flatSpeedToMetabolic', () => {
    for (const v of [0, 2.5, 5]) {
      expect(metabolicToFlatSpeed(flatSpeedToMetabolic(v, 0.94), 0.94)).toBeCloseTo(v, 10)
    }
  })
})

describe('ride power converters', () => {
  it('divides power by efficiency times mass', () => {
    // 0.25 * 75 kg = 18.75, and 285 / 18.75 = 15.2
    expect(ridePowerToMetabolic(285, 75, 0.25)).toBeCloseTo(15.2, 10)
  })

  it('multiplies metabolic rate back to power', () => {
    expect(metabolicToRidePower(15.2, 75, 0.25)).toBeCloseTo(285, 9)
  })

  it('round-trips in both directions', () => {
    expect(metabolicToRidePower(ridePowerToMetabolic(312, 68, 0.22), 68, 0.22)).toBeCloseTo(312, 9)
    expect(ridePowerToMetabolic(metabolicToRidePower(3.1, 82, 0.2), 82, 0.2)).toBeCloseTo(3.1, 10)
  })
})

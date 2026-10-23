import { describe, expect, it } from 'vitest'
import { BALANCE_SPAN, METER_TRACK, balanceOffset, bandSpan, meterFraction } from './balanceScale'

describe('balanceOffset', () => {
  it('is zero for an even balance', () => {
    expect(balanceOffset(1)).toBe(0)
  })

  it('reaches the span at a lead of 30% in either sport', () => {
    expect(balanceOffset(1.3)).toBeCloseTo(1, 10)
    expect(balanceOffset(1 / 1.3)).toBeCloseTo(-1, 10)
    expect(BALANCE_SPAN).toBe(0.3)
  })

  it('is proportional inside the span', () => {
    expect(balanceOffset(1.12)).toBeCloseTo(0.4, 10)
    expect(balanceOffset(1 / 1.12)).toBeCloseTo(-0.4, 10)
  })

  it('clamps a larger lead to the edge', () => {
    expect(balanceOffset(4)).toBe(1)
    expect(balanceOffset(0.25)).toBe(-1)
  })

  it('is antisymmetric: a lead of running and the same lead of cycling mirror each other', () => {
    for (const ratio of [1.02, 1.1, 1.25, 2, 3]) {
      expect(balanceOffset(ratio)).toBeCloseTo(-balanceOffset(1 / ratio), 10)
    }
  })
})

describe('meterFraction', () => {
  it('centres an even balance', () => {
    expect(meterFraction(1)).toBe(0.5)
  })

  it('puts a running lead to the right of centre and a cycling lead to the left', () => {
    expect(meterFraction(1.12)).toBeCloseTo(0.69, 6)
    expect(meterFraction(1 / 1.12)).toBeCloseTo(0.31, 6)
  })

  it('keeps a 30% lead 8 units inside the end of the 320 unit track', () => {
    expect(METER_TRACK).toBe(320)
    expect(meterFraction(1.3) * METER_TRACK).toBeCloseTo(312, 6)
    expect(meterFraction(1 / 1.3) * METER_TRACK).toBeCloseTo(8, 6)
  })

  it('draws a larger lead at the same end of the track', () => {
    expect(meterFraction(4)).toBeCloseTo(meterFraction(1.3), 10)
    expect(meterFraction(0.25)).toBeCloseTo(meterFraction(1 / 1.3), 10)
  })
})

describe('bandSpan', () => {
  it('spans the range when it is wide enough to keep its rounded ends round', () => {
    expect(bandSpan(100, 140, 16)).toEqual({ start: 100, width: 40 })
  })

  it('widens a narrower range to its height, about its middle, so it stays on the balance', () => {
    expect(bandSpan(200, 202, 16)).toEqual({ start: 193, width: 16 })
  })
})

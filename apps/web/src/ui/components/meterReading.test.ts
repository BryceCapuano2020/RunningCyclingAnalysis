import { describe, expect, it } from 'vitest'
import { leanOfLead } from '../../domain/lean'
import { energyReading, gapReading } from './balanceScale'
import { interval } from './fixtures'
import { meterRange, meterValue, rangeVerdictText, readingChars } from './meterReading'

const gap = (centre: number, low: number, high: number) =>
  gapReading({ centre, low, high, lean: leanOfLead({ centre, low, high }) })

describe('meterValue', () => {
  it('signs the size of a grade gap in points, whichever sport leads', () => {
    expect(meterValue(gap(6, 1, 12))).toEqual({ number: '+6', unit: 'pts' })
    expect(meterValue(gap(-9, -14, -3))).toEqual({ number: '+9', unit: 'pts' })
  })

  it('writes a gap of nothing as 0 points, with no sign', () => {
    expect(meterValue(gap(0, -3, 3))).toEqual({ number: '0', unit: 'pts' })
  })

  it('gives an energy balance as a percent', () => {
    expect(meterValue(energyReading(interval(1.05, 1.12, 1.2)))).toEqual({
      number: '+12',
      unit: '%',
    })
  })
})

describe('meterRange', () => {
  it('writes a range that stays on the leading side as two plain numbers, read from that side', () => {
    expect(meterRange(gap(6, 1, 12))).toBe('1 to 12')
    expect(meterRange(gap(-9, -14, -3))).toBe('3 to 14')
  })

  it('writes a range that reaches zero or the other side with signs, as the headline does', () => {
    expect(meterRange(gap(5, -2, 12))).toBe('−2 to +12')
    expect(meterRange(gap(2, 0, 6))).toBe('0 to +6')
  })

  it('writes an energy range in percent', () => {
    expect(meterRange(energyReading(interval(1.05, 1.12, 1.2)))).toBe('5% to 20%')
  })

  it('has no range for a lead whose range rounds to one value, which the value says', () => {
    expect(meterRange(gap(6, 6.2, 5.8))).toBeNull()
  })
})

describe('meterValue for an energy balance', () => {
  const energy = (centre: number) =>
    ({ unit: 'percent', lean: 'run', lead: { centre, low: centre - 1, high: centre + 1 } }) as const

  it('writes exactly zero as 0, unsigned', () => {
    expect(meterValue(energy(0))).toEqual({ number: '0', unit: '%' })
  })

  it('writes a lead too small for one decimal as <0.1, not "+under 0.1"', () => {
    expect(meterValue(energy(0.03))).toEqual({ number: '<0.1', unit: '%' })
    expect(meterValue(energy(-0.03))).toEqual({ number: '<0.1', unit: '%' })
  })

  it('writes a small lead with one decimal, and signs it', () => {
    expect(meterValue(energy(0.4))).toEqual({ number: '+0.4', unit: '%' })
  })
})

describe('readingChars', () => {
  it('counts the number, the unit and the range line with its word', () => {
    expect(readingChars(gap(6, 1, 12))).toEqual({
      number: 2,
      unit: 3,
      range: 'range 1 to 12'.length,
    })
    expect(readingChars(gap(6, 6.2, 5.8)).range).toBe(0)
  })

  it('counts a percent range that reaches the other side, with its signs', () => {
    const long = {
      unit: 'percent',
      lean: 'run',
      lead: { centre: 12.4, low: -12.4, high: 30.5 },
    } as const
    expect(meterRange(long)).toBe('-12% to +31%')
    expect(readingChars(long).range).toBe('range -12% to +31%'.length)
  })
})

describe('rangeVerdictText', () => {
  it('says the lead holds when the whole range is on the leading side', () => {
    expect(rangeVerdictText(gap(6, 1, 12))).toBe('so the lead holds across the range')
    expect(rangeVerdictText(gap(-6, -12, -1))).toBe('so the lead holds across the range')
  })

  it('says the two could be level when the range reaches zero or crosses it', () => {
    expect(rangeVerdictText(gap(9, -4, 18))).toBe('so the two could be level')
    expect(rangeVerdictText(gap(2, 0, 6))).toBe('so the two could be level')
  })

  it('says nothing for a range that rounds to one value, or for an energy balance', () => {
    expect(rangeVerdictText(gap(6, 6.2, 5.8))).toBeNull()
    expect(rangeVerdictText(energyReading(interval(1.05, 1.12, 1.2)))).toBeNull()
  })
})

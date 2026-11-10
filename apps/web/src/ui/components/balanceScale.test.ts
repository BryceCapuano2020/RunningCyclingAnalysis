import { describe, expect, it } from 'vitest'
import { BALANCE_PAIR } from '../sports'
import type { BalanceGap } from '../balanceGap'
import { interval } from './test/fixtures'
import { balanceReading, energyReading, gapReading } from './balanceScale'

function gap(overrides: Partial<BalanceGap> = {}): BalanceGap {
  return { centre: 6, low: 2, high: 10, lean: 'run', ...overrides }
}

describe('energyReading', () => {
  it('reads an energy ratio as a percent lead, centred on the ratio', () => {
    const reading = energyReading(interval(1.05, 1.12, 1.2))
    expect(reading.unit).toBe('percent')
    expect(reading.lead.centre).toBeCloseTo(12, 6)
    expect(reading.lead.low).toBeCloseTo(5, 6)
    expect(reading.lead.high).toBeCloseTo(20, 6)
    expect(reading.lean).toBe(BALANCE_PAIR[0])
    expect(reading.pair).toEqual(BALANCE_PAIR)
  })

  it('reads a cycling lead as its inverse, so the two sports mirror', () => {
    const reading = energyReading(interval(0.75, 0.8, 0.9))
    expect(reading.lead.centre).toBeCloseTo(-25, 6)
    expect(reading.lean).toBe(BALANCE_PAIR[1])
  })

  it('is even when the 90% range spans 1', () => {
    expect(energyReading(interval(0.95, 1, 1.05)).lean).toBe('even')
  })

  it('keeps the centre inside its range', () => {
    const { lead } = energyReading(interval(0.75, 0.8, 0.9))
    expect(lead.low).toBeLessThanOrEqual(lead.centre)
    expect(lead.centre).toBeLessThanOrEqual(lead.high)
  })
})

describe('gapReading and balanceReading', () => {
  it('reads the age-grade gap in points, with its lean and range', () => {
    const reading = gapReading(gap({ centre: -4, low: -8, high: 0, lean: 'even' }))
    expect(reading).toEqual({
      pair: BALANCE_PAIR,
      unit: 'points',
      lean: 'even',
      lead: { centre: -4, low: -8, high: 0 },
    })
  })

  it('prefers the gap when there is one, so the headline and the share card read the same balance', () => {
    const reading = balanceReading(gap(), interval(1.05, 1.12, 1.2))
    expect(reading?.unit).toBe('points')
    expect(reading?.lead.centre).toBe(6)
  })

  it('falls back to the energy ratio without a gap', () => {
    const reading = balanceReading(null, interval(1.05, 1.12, 1.2))
    expect(reading?.unit).toBe('percent')
  })

  it('has no reading when there is neither a gap nor a ratio', () => {
    expect(balanceReading(null, null)).toBeNull()
  })
})

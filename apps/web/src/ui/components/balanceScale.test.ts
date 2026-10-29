import { describe, expect, it } from 'vitest'
import { SPORT_ORDER } from '../sports'
import type { BalanceGap } from '../balanceGap'
import { interval } from './fixtures'
import {
  SCALE_SPAN,
  balanceReading,
  bandSpan,
  cappedEnds,
  energyReading,
  gapReading,
  meterFraction,
} from './balanceScale'

/** Whether running is the first sport in SPORT_ORDER, so a running lead sits on the left. */
const RUN_ON_LEFT = SPORT_ORDER[0] === 'run'

function gap(overrides: Partial<BalanceGap> = {}): BalanceGap {
  return { centre: 6, low: 2, high: 10, lean: 'run', ...overrides }
}

describe('meterFraction', () => {
  it('centres an even balance', () => {
    expect(meterFraction(0)).toBe(0.5)
  })

  it('puts a running lead on the running side of the track, as the sport order says', () => {
    expect(meterFraction(6) < 0.5).toBe(RUN_ON_LEFT)
  })

  it('puts a cycling lead on the cycling side, the other way round', () => {
    expect(meterFraction(-6) < 0.5).toBe(!RUN_ON_LEFT)
  })

  it('mirrors a lead of either sport about the centre', () => {
    for (const lead of [2, 10, 20, 30]) {
      expect(meterFraction(lead) + meterFraction(-lead)).toBeCloseTo(1, 10)
    }
  })

  it('moves steadily toward the running side as the lead grows', () => {
    const direction = RUN_ON_LEFT ? -1 : 1
    expect((meterFraction(10) - meterFraction(0)) * direction).toBeGreaterThan(0)
    expect((meterFraction(20) - meterFraction(10)) * direction).toBeGreaterThan(0)
  })

  it('keeps a lead at the scale span just inside the end of the track', () => {
    const edge = Math.abs(meterFraction(SCALE_SPAN) - 0.5)
    expect(edge).toBeGreaterThan(0.45)
    expect(edge).toBeLessThan(0.5)
  })

  it('draws a lead past the span at the same end as the span itself', () => {
    expect(meterFraction(45)).toBe(meterFraction(SCALE_SPAN))
    expect(meterFraction(-99)).toBe(meterFraction(-SCALE_SPAN))
  })
})

describe('cappedEnds', () => {
  it('caps neither end while the range stays inside the span', () => {
    expect(cappedEnds(gap())).toEqual({ running: false, cycling: false })
  })

  it('caps the running end only past the span: a lead of exactly 30 is at the end, not past it', () => {
    expect(cappedEnds({ centre: 35, low: 31, high: 40 }).running).toBe(true)
    expect(cappedEnds({ centre: 30, low: 30, high: 30 }).running).toBe(false)
  })

  it('caps the running end when only the top of the range is past the span', () => {
    expect(cappedEnds({ centre: 10, low: 5, high: 32 })).toEqual({
      running: true,
      cycling: false,
    })
  })

  it('caps the cycling end the same way, on the other side of zero', () => {
    expect(cappedEnds({ centre: -31, low: -40, high: -20 })).toEqual({
      running: false,
      cycling: true,
    })
  })
})

describe('energyReading', () => {
  it('reads an energy ratio as a percent lead, centred on the ratio', () => {
    const reading = energyReading(interval(1.05, 1.12, 1.2))
    expect(reading.unit).toBe('percent')
    expect(reading.lead.centre).toBeCloseTo(12, 6)
    expect(reading.lead.low).toBeCloseTo(5, 6)
    expect(reading.lead.high).toBeCloseTo(20, 6)
    expect(reading.lean).toBe('run')
  })

  it('reads a cycling lead as its inverse, so the two sports mirror', () => {
    const reading = energyReading(interval(0.75, 0.8, 0.9))
    expect(reading.lead.centre).toBeCloseTo(-25, 6)
    expect(reading.lean).toBe('ride')
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
      unit: 'points',
      lean: 'even',
      lead: { centre: -4, low: -8, high: 0 },
    })
  })

  it('prefers the gap when there is one, so the headline and the meter read the same balance', () => {
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

describe('bandSpan', () => {
  it('spans the range when it is wide enough to keep its rounded ends round', () => {
    expect(bandSpan(100, 140, 16)).toEqual({ start: 100, width: 40 })
  })

  it('widens a narrower range to its height, about its middle, so it stays on the balance', () => {
    expect(bandSpan(200, 202, 16)).toEqual({ start: 193, width: 16 })
  })
})

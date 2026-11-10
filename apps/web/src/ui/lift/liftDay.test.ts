import { localDateText, setViewerZone } from '@rca/core/calendar'
import { describe, expect, it } from 'vitest'
import { dayNoonMs, isDay, liftDayOf, liftHashOf, shiftDay } from './liftDay'

const TODAY = '2026-03-10'

describe('liftDayOf', () => {
  it('reads the day of the query', () => {
    expect(liftDayOf('#/lift?day=2026-03-04', TODAY)).toBe('2026-03-04')
    expect(liftDayOf(`#/lift?day=${TODAY}`, TODAY)).toBe(TODAY)
  })

  it('is today with no day, an invalid day, or a day after today', () => {
    for (const hash of [
      '#/lift',
      '#/lift?day=',
      '#/lift?day=yesterday',
      '#/lift?day=2026-02-31',
      '#/lift?day=2026-13-01',
      '#/lift?day=2026-3-4',
      '#/lift?day=2026-03-11',
      '#/lift?day=2027-01-01',
    ])
      expect(liftDayOf(hash, TODAY)).toBe(TODAY)
  })
})

describe('liftHashOf', () => {
  it('writes today as the page itself and another day in the query, and reads it back', () => {
    expect(liftHashOf(TODAY, TODAY)).toBe('#/lift')
    expect(liftHashOf('2026-03-04', TODAY)).toBe('#/lift?day=2026-03-04')
    expect(liftDayOf(liftHashOf('2026-03-04', TODAY), TODAY)).toBe('2026-03-04')
  })
})

describe('shiftDay', () => {
  it('steps across months, years and leap days', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('is one calendar day over a clock change, whatever zone the code runs in', () => {
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09')
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02')
    expect(shiftDay('2026-03-09', -1)).toBe('2026-03-08')
  })
})

describe('isDay and dayNoonMs', () => {
  it('accept only real days', () => {
    expect(isDay('2024-02-29')).toBe(true)
    expect(isDay('2026-02-29')).toBe(false)
    expect(dayNoonMs('2026-02-29')).toBeNull()
  })

  it('puts a day at noon in the viewer zone, so a formatter reads the same date', () => {
    expect(dayNoonMs('2026-03-08')).toBe(Date.UTC(2026, 2, 8, 12))
    const before = setViewerZone(() => -10 * 60)
    try {
      const noon = dayNoonMs('2026-03-08') ?? 0
      expect(noon).toBe(Date.UTC(2026, 2, 8, 22))
      expect(localDateText(noon)).toBe('2026-03-08')
    } finally {
      setViewerZone(before)
    }
  })
})

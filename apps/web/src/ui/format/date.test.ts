import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTimeOfDay as coreFormatTimeOfDay } from '@rca/core/units'
import { formatDay, formatMonth, formatRowDay, formatSpan, formatTimeOfDay } from './date'

// Local constructors keep these cases independent of the zone the suite runs in. The only test
// that changes the zone says so.
const JUNE_10_2026 = new Date(2026, 5, 10, 12).getTime()

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('formatDay', () => {
  it('names the weekday, day and month, and leaves out the year in the current year', () => {
    expect(formatDay(new Date(2026, 5, 3, 7, 30).getTime(), JUNE_10_2026)).toBe('Wed 3 Jun')
  })

  it('adds the year when the day is in another year', () => {
    expect(formatDay(new Date(2025, 5, 3).getTime(), JUNE_10_2026)).toBe('Tue 3 Jun 2025')
  })

  it('shows the year across a new year, and not once the year has begun', () => {
    const lateDecember = new Date(2025, 11, 31, 23, 45).getTime()
    expect(formatDay(lateDecember, new Date(2026, 0, 1, 0, 30).getTime())).toBe('Wed 31 Dec 2025')
    expect(formatDay(lateDecember, new Date(2025, 11, 31, 23, 59).getTime())).toBe('Wed 31 Dec')
    expect(
      formatDay(new Date(2026, 0, 1, 0, 30).getTime(), new Date(2026, 0, 1, 9).getTime()),
    ).toBe('Thu 1 Jan')
  })

  it('puts an activity at local midnight on its own day', () => {
    const midnight = new Date(2026, 5, 3, 0, 0, 0, 0).getTime()
    expect(formatDay(midnight, JUNE_10_2026)).toBe('Wed 3 Jun')
    expect(formatDay(midnight - 1, JUNE_10_2026)).toBe('Tue 2 Jun')
  })

  it('reads the day in the viewer zone, not UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland')
    // 20:00 UTC on 2 June is 08:00 on 3 June in Auckland, which is in winter time (UTC+12).
    expect(formatDay(Date.UTC(2026, 5, 2, 20, 0), JUNE_10_2026)).toBe('Wed 3 Jun')
  })
})

describe('formatMonth', () => {
  it('names the month, and adds the year only when asked for it', () => {
    expect(formatMonth(new Date(2026, 9, 2).getTime(), false)).toBe('Oct')
    expect(formatMonth(new Date(2023, 2, 30).getTime(), true)).toBe('Mar 2023')
  })
})

describe('formatTimeOfDay', () => {
  it('is the one formatter in core, not a second copy in the web app', () => {
    expect(formatTimeOfDay).toBe(coreFormatTimeOfDay)
  })

  it('reads the local time in twelve-hour form with no leading zero on the hour', () => {
    expect(formatTimeOfDay(new Date(2026, 5, 3, 6, 42).getTime())).toBe('6:42 am')
    expect(formatTimeOfDay(new Date(2026, 5, 3, 18, 5).getTime())).toBe('6:05 pm')
  })

  it('shows midnight and noon as twelve', () => {
    expect(formatTimeOfDay(new Date(2026, 5, 3, 0, 0).getTime())).toBe('12:00 am')
    expect(formatTimeOfDay(new Date(2026, 5, 3, 12, 0).getTime())).toBe('12:00 pm')
  })

  it('reads the local hour of a UTC timestamp', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    // 02:30 UTC on 3 June is 19:30 on 2 June in Los Angeles, which is in summer time (UTC-7).
    expect(formatTimeOfDay(Date.UTC(2026, 5, 3, 2, 30))).toBe('7:30 pm')
  })
})

describe('formatSpan', () => {
  it('gives the days and months with the year once, at the end, within one year', () => {
    expect(formatSpan(new Date(2025, 4, 12, 9).getTime(), new Date(2025, 7, 3, 18).getTime())).toBe(
      '12 May – 3 Aug 2025',
    )
  })

  it('gives the year on both ends when the span crosses a new year', () => {
    expect(formatSpan(new Date(2024, 7, 3).getTime(), new Date(2025, 10, 2).getTime())).toBe(
      '3 Aug 2024 – 2 Nov 2025',
    )
  })
})

describe('formatRowDay', () => {
  it('gives the weekday and the day, with no month or year, for a row under its heading', () => {
    expect(formatRowDay(new Date(2025, 5, 14, 7, 5).getTime())).toBe('Sat 14')
  })
})

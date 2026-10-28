import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import { thinToMonths } from './monthlyTrend'

/** Sunday 5 January 2020, UTC, and the Sundays after it. */
const FIRST = Date.UTC(2020, 0, 5, 23, 59, 59, 999)
const weeks = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ endMs: FIRST + i * 7 * DAY_MS }))

describe('thinToMonths', () => {
  it('leaves a trend of a year or so as it is, a point a week', () => {
    const year = weeks(53)
    const thinned = thinToMonths(year)
    expect(thinned.monthly).toBe(false)
    expect(thinned.weeks).toBe(year)
  })

  it('keeps the last week of each month beyond that, and the first and last weeks as its ends', () => {
    const long = weeks(260)
    const { weeks: kept, monthly } = thinToMonths(long)
    expect(monthly).toBe(true)
    expect(kept[0]).toBe(long[0])
    expect(kept.at(-1)).toBe(long.at(-1))
    // Five years is sixty months, and the first week stands beside January's own last week.
    expect(kept.length).toBeGreaterThanOrEqual(60)
    expect(kept.length).toBeLessThanOrEqual(62)
    // A month's kept week is its last: the next Sunday is in the next month.
    for (const week of kept.slice(1, -1)) {
      expect(new Date(week.endMs + 7 * DAY_MS).getUTCMonth()).not.toBe(
        new Date(week.endMs).getUTCMonth(),
      )
    }
  })

  it('keeps the weeks in time order and each once', () => {
    const { weeks: kept } = thinToMonths(weeks(120))
    expect(kept.map((week) => week.endMs)).toEqual(
      [...new Set(kept.map((week) => week.endMs))].sort((a, b) => a - b),
    )
  })

  it('returns an empty trend as it is', () => {
    expect(thinToMonths([])).toEqual({ weeks: [], monthly: false })
  })
})

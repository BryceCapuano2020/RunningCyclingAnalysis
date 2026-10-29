import { describe, expect, it } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import { weekEndMs } from '@rca/core/digest/trendPoints'
import { onSharedWeeks, periodWeekEnds } from './sharedWeeks'

const WEEK = 7 * DAY_MS
const FIRST = weekEndMs(Date.UTC(2026, 8, 6))

describe('periodWeekEnds', () => {
  const trend = [0, 1, 2, 3].map((i) => FIRST + i * WEEK)

  it('runs from the week the period starts in through the trend’s last, a week at a time', () => {
    // The period starts on 3 Aug, four weeks before the trend begins.
    const ends = periodWeekEnds(trend, Date.UTC(2026, 7, 3, 12))
    expect(ends[0]).toBe(weekEndMs(Date.UTC(2026, 7, 3, 12)))
    expect(ends.at(-1)).toBe(trend.at(-1))
    expect(ends).toHaveLength(8)
    ends.slice(1).forEach((end, i) => expect(end - ends[i]!).toBe(WEEK))
    expect(ends).toEqual(expect.arrayContaining(trend))
  })

  it('is the trend’s own weeks for all time, and for a period that starts with it', () => {
    expect(periodWeekEnds(trend, null)).toEqual(trend)
    expect(periodWeekEnds(trend, FIRST - 3 * DAY_MS)).toEqual(trend)
  })

  it('never starts later than the trend does, nor adds weeks after it', () => {
    expect(periodWeekEnds(trend, FIRST + 10 * DAY_MS)).toEqual(trend)
  })

  it('is empty without a trend', () => {
    expect(periodWeekEnds([], Date.UTC(2026, 7, 3))).toEqual([])
  })
})

describe('onSharedWeeks', () => {
  it('keeps the graded weeks and fills the weeks before the trend with weeks that have no grade', () => {
    const graded = {
      endMs: FIRST,
      run: 0.6,
      ride: null,
      rideLow: null,
      rideHigh: null,
      runCount: 2,
      rideCount: 0,
    }
    const weeks = onSharedWeeks([graded], [FIRST - 2 * WEEK, FIRST - WEEK, FIRST])
    expect(weeks.map((week) => week.endMs)).toEqual([FIRST - 2 * WEEK, FIRST - WEEK, FIRST])
    expect(weeks[2]).toBe(graded)
    expect(weeks[0]).toMatchObject({ run: null, ride: null, runCount: 0, rideCount: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { dayOfCivil, weekOfDay } from '../calendar'
import { isoWeekOf } from './isoWeeks'

/** The ISO week that holds a date (month 1 to 12). */
const holding = (year: number, month: number, date: number) =>
  isoWeekOf(weekOfDay(dayOfCivil(year, month - 1, date)))

describe('isoWeekOf', () => {
  it('puts a week that spans New Year in the year of its Thursday', () => {
    // Monday 29 December 2025 to Sunday 4 January 2026: Thursday is 1 January.
    for (const [year, month, date] of [
      [2025, 12, 29],
      [2025, 12, 31],
      [2026, 1, 4],
    ] as const) {
      expect(holding(year, month, date)).toMatchObject({ year: 2026, number: 1, month: 0 })
    }
    // Monday 28 December 2020 to Sunday 3 January 2021: Thursday is 31 December, in a 53-week year.
    expect(holding(2021, 1, 3)).toMatchObject({ year: 2020, number: 53, month: 11 })
    expect(holding(2021, 1, 4)).toMatchObject({ year: 2021, number: 1 })
  })

  it('numbers the weeks of a leap year by their Thursdays', () => {
    // Thursday 29 February 2024 is in the week of Monday 26 February.
    const leapWeek = holding(2024, 2, 29)
    expect(leapWeek).toMatchObject({ year: 2024, number: 9, month: 1 })
    expect(leapWeek.mondayDay).toBe(dayOfCivil(2024, 1, 26))
    expect(holding(2024, 3, 3).number).toBe(9)
    expect(holding(2024, 3, 4)).toMatchObject({ number: 10, month: 2 })
    // The week with 29 February is the one with its own month: Monday 26 February to Sunday 3 March has a Thursday in February.
    expect(holding(2023, 3, 1).number).toBe(9)
  })

  it('gives week 52 or 53 as the last of a year, and 53 only in the years ISO 8601 makes long', () => {
    const lastNumbers = new Map<number, number>()
    let previous = holding(1999, 12, 31)
    const from = weekOfDay(dayOfCivil(1999, 11, 31)) + 1
    for (let week = from; week < weekOfDay(dayOfCivil(2034, 0, 1)); week++) {
      const current = isoWeekOf(week)
      // One week after another: the number counts up, or starts again at 1 in the new year.
      if (current.year === previous.year) expect(current.number).toBe(previous.number + 1)
      else {
        expect(current.number).toBe(1)
        lastNumbers.set(previous.year, previous.number)
      }
      previous = current
    }
    const longYears = [...lastNumbers].filter(([, last]) => last === 53).map(([year]) => year)
    expect(longYears).toEqual([2004, 2009, 2015, 2020, 2026, 2032])
    expect([...lastNumbers.values()].every((last) => last === 52 || last === 53)).toBe(true)
  })
})

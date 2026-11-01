import { trainingWeeks } from '@rca/core/history'
import { describe, expect, it } from 'vitest'
import { calendarOf } from '../calendarFixtures'
import type { DaySpec } from '../calendarFixtures'
import { gridOf, totalOfWeek } from './calendarGrid'

const weeksOf = (days: DaySpec[]) => trainingWeeks(calendarOf(days))

describe('gridOf', () => {
  it('has a row for each year and a column for each week of the year, a week of rest between as a cell of zeros', () => {
    const grid = gridOf(
      weeksOf([
        { on: [2024, 1, 3], run: [2, 1] },
        { on: [2024, 1, 24], run: [1, 1] },
      ]),
      'all',
      'weeks',
    )
    expect(grid.years).toEqual([2024])
    expect(grid.columns).toBe(52)
    expect(grid.cells.map((c) => [c.row, c.col, c.hours, c.activities, c.rate])).toEqual([
      [0, 0, 2, 1, 2],
      [0, 1, 0, 0, 0],
      [0, 2, 0, 0, 0],
      [0, 3, 1, 1, 1],
    ])
  })

  it('makes one cell of the week that spans New Year, in the year most of it is in', () => {
    // Wednesday 31 December 2025 and Friday 2 January 2026: one week, whose Thursday is 1 January 2026.
    const grid = gridOf(
      weeksOf([
        { on: [2025, 12, 31], run: [1, 1] },
        { on: [2026, 1, 2], run: [1.5, 1] },
      ]),
      'all',
      'weeks',
    )
    expect(grid.years).toEqual([2026])
    expect(grid.cells).toHaveLength(1)
    expect(grid.cells[0]).toMatchObject({ row: 0, col: 0, year: 2026, hours: 2.5, activities: 2 })
  })

  it('gives a long year its 53rd column, and the next year starts again at the first', () => {
    const grid = gridOf(
      weeksOf([
        { on: [2020, 12, 30], run: [1, 1] },
        { on: [2021, 1, 5], run: [1, 1] },
      ]),
      'all',
      'weeks',
    )
    expect(grid.columns).toBe(53)
    expect(grid.years).toEqual([2020, 2021])
    expect(grid.cells.map((c) => [c.row, c.col])).toEqual([
      [0, 52],
      [1, 0],
    ])
  })

  it('puts 29 February in its week of a leap year, and in February when the columns are months', () => {
    const days: DaySpec[] = [{ on: [2024, 2, 29], run: [1, 1] }]
    expect(gridOf(weeksOf(days), 'all', 'weeks').cells[0]).toMatchObject({ col: 8 })
    expect(gridOf(weeksOf(days), 'all', 'months').cells[0]).toMatchObject({ col: 1, weeks: 1 })
  })

  it('keeps the sports the filter names and zeros the others', () => {
    const weeks = weeksOf([{ on: [2024, 5, 7], run: [2, 2], ride: [3, 1] }])
    const [all] = gridOf(weeks, 'all', 'weeks').cells
    const [run] = gridOf(weeks, 'run', 'weeks').cells
    const [ride] = gridOf(weeks, 'ride', 'weeks').cells
    expect([all!.hours, all!.activities]).toEqual([5, 3])
    expect([run!.hours, run!.activities, run!.sports.ride.activities]).toEqual([2, 2, 0])
    expect([ride!.hours, ride!.activities, ride!.sports.run.activities]).toEqual([3, 1, 0])
    expect(totalOfWeek(weeks[0]!, 'ride')).toEqual({ hours: 3, activities: 1 })
  })

  it('counts a week trained in the sport of the filter only', () => {
    const weeks = weeksOf([
      { on: [2024, 5, 7], run: [1, 1] },
      { on: [2024, 5, 14], ride: [2, 1] },
    ])
    expect(gridOf(weeks, 'run', 'months').cells.map((c) => c.trained)).toEqual([1])
    expect(gridOf(weeks, 'all', 'months').cells.map((c) => c.trained)).toEqual([2])
  })

  it('gathers the weeks of a month by their Thursdays, a cell’s rate the hours in its average week', () => {
    // Weeks of Monday 26 February to 1 April 2024; March has the Thursdays 7, 14, 21 and 28.
    const grid = gridOf(
      weeksOf([
        { on: [2024, 2, 28], run: [1, 1] },
        { on: [2024, 3, 5], run: [2, 1] },
        { on: [2024, 3, 20], run: [3, 1] },
        { on: [2024, 4, 2], run: [1, 1] },
      ]),
      'all',
      'months',
    )
    expect(grid.columns).toBe(12)
    expect(grid.cells.map((c) => [c.col, c.weeks, c.trained, c.hours, c.rate])).toEqual([
      [1, 1, 1, 1, 1],
      [2, 4, 2, 5, 1.25],
      [3, 1, 1, 1, 1],
    ])
  })

  it('runs rows through a year with no training and is empty for no weeks', () => {
    const grid = gridOf(
      weeksOf([
        { on: [2021, 6, 2], run: [1, 1] },
        { on: [2023, 6, 2], run: [1, 1] },
      ]),
      'all',
      'weeks',
    )
    expect(grid.years).toEqual([2021, 2022, 2023])
    expect(grid.cells.filter((c) => c.row === 1).every((c) => c.activities === 0)).toBe(true)
    expect(gridOf([], 'all', 'weeks')).toEqual({ years: [], columns: 0, cells: [] })
  })
})

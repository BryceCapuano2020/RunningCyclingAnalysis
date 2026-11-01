import { describe, expect, it } from 'vitest'
import type { YearToDate } from '@rca/core/history'
import { yearToDateTable, yearToDateTitle, yearToDateTooltip } from './yearToDateText'
import { SAMPLE_DAYS, TODAY, THIS_YEAR_ONLY, YEAR_TO_DATE } from '../yearToDateFixtures'

/** The library with this year's run distance to today set to `total` metres, against the best past year's 90 km. */
const withThisYear = (total: number): YearToDate => ({
  today: TODAY,
  days: SAMPLE_DAYS,
  years: [
    YEAR_TO_DATE.years[1]!,
    {
      year: 2027,
      metres: { run: [], ride: [] },
      toDate: { run: total, ride: 0 },
    },
  ],
})

describe('the year-to-date title', () => {
  it('states this year against the best past year to date, in the units setting', () => {
    expect(yearToDateTitle(YEAR_TO_DATE, 'run', 'metric')).toBe('2027 is 18 km behind 2025')
    expect(yearToDateTitle(YEAR_TO_DATE, 'run', 'imperial')).toBe('2027 is 11 mi behind 2025')
  })

  it('compares a sport this year has none of with the best past year, and says it is behind', () => {
    expect(yearToDateTitle(YEAR_TO_DATE, 'ride', 'metric')).toBe('2027 is 30 km behind 2025')
  })

  it('says above when this year is ahead, and level when the gap rounds to nothing', () => {
    expect(yearToDateTitle(withThisYear(120_000), 'run', 'metric')).toBe('2027 is 30 km above 2025')
    expect(yearToDateTitle(withThisYear(90_000), 'run', 'metric')).toBe('2027 is level with 2025')
  })

  it('states the total so far when no past year has any distance by today', () => {
    expect(yearToDateTitle(THIS_YEAR_ONLY, 'run', 'metric')).toBe('2027 has 72 km so far')
  })

  it('says what is missing when neither this year nor a past year has the sport', () => {
    expect(yearToDateTitle(THIS_YEAR_ONLY, 'ride', 'metric')).toBe('No rides in 2027 yet')
  })
})

describe('the year-to-date table', () => {
  it('gives each year to today and its whole year, with this year in progress', () => {
    const table = yearToDateTable(YEAR_TO_DATE, 'run', 'metric')
    expect(table.caption).toBe('Run distance by year')
    expect(table.columns).toEqual(['Year', 'To 1 Mar', 'Whole year'])
    expect(table.rows).toEqual([
      ['2024', '61 km', '366 km'],
      ['2025', '90 km', '549 km'],
      ['2026', '60 km', '366 km'],
      ['2027', '72 km', 'In progress'],
    ])
  })

  it('shows a year with no activity in a sport as none', () => {
    const rows = yearToDateTable(YEAR_TO_DATE, 'ride', 'metric').rows
    expect(rows[0]).toEqual(['2024', '0 km', '0 km'])
    expect(rows[2]).toEqual(['2026', '0 km', '0 km'])
  })
})

describe('the year-to-date tooltip', () => {
  it('names the day and gives each year its distance to that day, newest first', () => {
    const index = SAMPLE_DAYS.indexOf(TODAY.day)
    const { title, rows } = yearToDateTooltip(YEAR_TO_DATE, 'run', 'metric', index)
    expect(title).toBe('To 1 Mar')
    expect(rows.map((row) => [row.label, row.value, row.kind])).toEqual([
      ['2027', '72 km', 'run'],
      ['2026', '60 km', 'neutral'],
      ['2025', '90 km', 'neutral'],
      ['2024', '60 km', 'neutral'],
    ])
  })

  it('names an earlier day of this year by its date', () => {
    expect(yearToDateTooltip(YEAR_TO_DATE, 'run', 'metric', 0).title).toBe('To 7 Jan')
  })
})

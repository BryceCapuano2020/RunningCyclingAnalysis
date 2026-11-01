import { describe, expect, it } from 'vitest'
import type { IntensityRow, IntensityShares } from '@rca/core/history'
import {
  emptyTextOf,
  hardestYear,
  intensityTable,
  intensityTitle,
  intensityTooltip,
} from './intensityByYearText'

const NONE: IntensityShares = {
  easy: 0,
  moderate: 0,
  hard: 0,
  seconds: 0,
  counted: 0,
  noZones: 0,
  activities: 0,
}

/** A year of a sport with `hours` of heart-rate time, `hard` of it in zones 4 and 5. */
const timed = (hard: number, hours = 20, counted = 20): IntensityShares => ({
  easy: 1 - hard,
  moderate: 0,
  hard,
  seconds: hours * 3600,
  counted,
  noZones: 0,
  activities: counted,
})

const year = (
  year: number,
  run: IntensityShares = NONE,
  ride: IntensityShares = NONE,
): IntensityRow => ({ year, sports: { run, ride } })

describe('the hardest year', () => {
  it('is the year with the largest hard share when it leads the next by 5 points', () => {
    const years = [year(2023, timed(0.1)), year(2024, timed(0.2)), year(2025, timed(0.5))]
    expect(hardestYear(years, 'run')?.year).toBe(2025)
    expect(intensityTitle(years, 'run')).toBe('2025 was your hardest year for running')
  })

  it('falls back to the measure when the lead is under 5 points', () => {
    const years = [year(2024, timed(0.3)), year(2025, timed(0.32))]
    expect(hardestYear(years, 'run')).toBeNull()
    expect(intensityTitle(years, 'run')).toBe('Run intensity by year')
  })

  it('leaves out a year with under 20 hours of the sport, and needs two that have it', () => {
    const thin = [year(2024, timed(0.9, 19.9)), year(2025, timed(0.3)), year(2023, timed(0.1))]
    expect(hardestYear(thin, 'run')?.year).toBe(2025)
    expect(hardestYear([year(2025, timed(0.6)), year(2024, timed(0.9, 19.9))], 'run')).toBeNull()
  })

  it('counts exactly 20 hours, and names riding for the ride', () => {
    const years = [year(2024, NONE, timed(0.1)), year(2025, NONE, timed(0.4, 20))]
    expect(intensityTitle(years, 'ride')).toBe('2025 was your hardest year for riding')
    expect(intensityTitle(years, 'run')).toBe('Run intensity by year')
  })
})

describe('the empty text', () => {
  it('asks a rides-only library for rides, and never runs', () => {
    const years = [year(2025, NONE, { ...NONE, activities: 12 })]
    expect(emptyTextOf(years, 'ride')).toBe(
      "Add rides with a heart rate to see each year's intensity.",
    )
  })

  it('asks for a maximum heart rate where runs have a heart rate with no zones to cut', () => {
    const years = [year(2025, { ...NONE, noZones: 4, activities: 4 })]
    expect(emptyTextOf(years, 'run')).toBe(
      "Enter your max heart rate for running on Profile to see each year's intensity.",
    )
  })
})

describe('the table and the tooltip', () => {
  it('gives each band a share, dashes a year with no heart rate, and counts activities', () => {
    const years = [year(2024, timed(0.25, 10, 3)), year(2025)]
    const table = intensityTable(years, 'run')
    expect(table.columns).toEqual([
      'Year',
      'Easy (zones 1 and 2)',
      'Moderate (zone 3)',
      'Hard (zones 4 and 5)',
      'Heart-rate time (h)',
      'Activities counted',
    ])
    expect(table.rows).toEqual([
      ['2024', '75%', '0%', '25%', '10.0', '3'],
      ['2025', '—', '—', '—', '—', '0'],
    ])
  })

  it('reads a year from the top band down, then its time and count', () => {
    const tooltip = intensityTooltip([year(2024, timed(0.25, 10, 1))], 'run', 0, 10, 20)
    expect(tooltip?.title).toBe('2024')
    expect(tooltip?.rows.map((row) => row.label)).toEqual([
      'Hard',
      'Moderate',
      'Easy',
      'Heart-rate time',
    ])
    expect(tooltip?.rows.at(-1)).toMatchObject({ value: '10.0 h', note: '1 run' })
  })

  it('says a year with no heart rate has none to count', () => {
    const tooltip = intensityTooltip([year(2024)], 'run', 0, 0, 0)
    expect(tooltip?.rows).toEqual([{ label: 'Heart rate', value: '—', note: 'None to count' }])
    expect(intensityTooltip([], 'run', 0, 0, 0)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import type { IntensityRow, IntensityShares } from '@rca/core/history'
import {
  hardestYear,
  intensityTable,
  intensityTitle,
  intensityTooltip,
} from './intensityByYearText'

const NONE: IntensityShares = { easy: 0, moderate: 0, hard: 0, seconds: 0, counted: 0 }
const timed = (hard: number, counted = 20): IntensityShares => ({
  easy: 1 - hard,
  moderate: 0,
  hard,
  seconds: 36_000,
  counted,
})
const year = (
  year: number,
  run: IntensityShares = NONE,
  ride: IntensityShares = NONE,
): IntensityRow => ({
  year,
  sports: { run, ride },
})

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

  it('leaves out a year too thin to compare, and needs two that are not', () => {
    const thin = [year(2024, timed(0.9, 2)), year(2025, timed(0.3)), year(2023, timed(0.1))]
    expect(hardestYear(thin, 'run')?.year).toBe(2025)
    expect(hardestYear([year(2025, timed(0.6)), year(2024, timed(0.9, 2))], 'run')).toBeNull()
  })

  it('names riding for the ride, from the sport it is read for', () => {
    const years = [year(2024, NONE, timed(0.1)), year(2025, NONE, timed(0.4))]
    expect(intensityTitle(years, 'ride')).toBe('2025 was your hardest year for riding')
    expect(intensityTitle(years, 'run')).toBe('Run intensity by year')
  })
})

describe('the table and the tooltip', () => {
  it('gives each band a share, dashes a year with no heart rate, and counts activities', () => {
    const years = [year(2024, timed(0.25, 3)), year(2025)]
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
    const tooltip = intensityTooltip([year(2024, timed(0.25, 1))], 'run', 0, 10, 20)
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

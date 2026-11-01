import { describe, expect, it } from 'vitest'
import { THREE_YEARS, yearRow } from './historyFixtures'
import { summaryOf } from './historySummary'

const pairs = (stats: ReturnType<typeof summaryOf>) => stats.map((s) => [s.label, s.value])

describe('summaryOf', () => {
  it('gives the years on file, the hours in all of them and each sport’s distance, in the units asked', () => {
    expect(pairs(summaryOf(THREE_YEARS, 'metric'))).toEqual([
      ['Years on file', '3'],
      ['Total hours', '470 h'],
      ['Run distance', '1,850.0 km'],
      ['Ride distance', '4,800.0 km'],
    ])
    expect(
      summaryOf(THREE_YEARS, 'imperial')
        .map((s) => s.value)
        .slice(2),
    ).toEqual(['1,149.5 mi', '2,982.6 mi'])
  })

  it('works for one year of one sport, and is empty without years', () => {
    const one = summaryOf(
      [yearRow(2024, { hours: 3.25, distanceM: 30_000, activities: 4 })],
      'metric',
    )
    expect(pairs(one)).toEqual([
      ['Year on file', '1'],
      ['Total hours', '3.3 h'],
      ['Run distance', '30.0 km'],
    ])
    expect(one[2]?.sport).toBe('run')
    expect(summaryOf([], 'metric')).toEqual([])
  })
})

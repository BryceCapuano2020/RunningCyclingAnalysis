import { describe, expect, it } from 'vitest'
import { importRows, rowsOrSentence } from './importRows'

const NOW = new Date(2025, 5, 20, 12).getTime()
const day = (month: number, d: number, year = 2025) => new Date(year, month, d, 9).getTime()

describe('importRows', () => {
  it('gives what was added and its span, label over value', () => {
    const rows = importRows(
      {
        activities: 8,
        rejected: 0,
        runs: 5,
        rides: 3,
        firstStartMs: day(2, 4, 2024),
        lastStartMs: day(4, 9),
      },
      NOW,
    )
    expect(rows).toEqual([
      { label: 'Added', value: '5 runs and 3 rides' },
      { label: 'Dates', value: 'Mar 2024 to May 2025' },
    ])
  })

  it('names the one day of a single activity, and one month for a span inside it', () => {
    const one = {
      activities: 1,
      rejected: 0,
      runs: 1,
      firstStartMs: day(2, 4),
      lastStartMs: day(2, 4),
    }
    expect(importRows(one, NOW)[1]).toEqual({ label: 'Date', value: '4 Mar' })
    const month = { ...one, runs: 2, lastStartMs: day(2, 20) }
    expect(importRows(month, NOW)[1]).toEqual({ label: 'Dates', value: 'Mar' })
  })

  it('adds a row for what was updated, restored and labelled, each only when there is some', () => {
    const rows = importRows(
      {
        activities: 4,
        rejected: 0,
        updatedRuns: 1,
        updatedRides: 2,
        detailRestored: 3,
        labelled: 1,
      },
      NOW,
    )
    expect(rows).toEqual([
      { label: 'Updated', value: '1 run and 2 rides' },
      { label: 'Detail restored', value: '3 activities' },
      { label: 'Labelled, now left out', value: '1 activity' },
    ])
  })

  it('has one sentence, not rows, for an import that brought nothing new', () => {
    expect(rowsOrSentence({ activities: 3, rejected: 0 }, NOW)).toEqual({
      rows: [],
      sentence: 'Nothing new: 3 activities already in your library.',
    })
    expect(rowsOrSentence({ activities: 0, rejected: 0 }, NOW).sentence).toBe(
      'No activities were analysed.',
    )
  })
})

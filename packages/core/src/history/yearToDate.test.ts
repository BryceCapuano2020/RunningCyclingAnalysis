import { describe, expect, it } from 'vitest'
import { setViewerZone } from '../calendar'
import { MODEL_REVISION } from '../digest/modelRevision'
import type { ActivityDigest, Sport } from '../types'
import { historyOf, NO_HISTORY } from './compute'
import type { HistoryInput } from './types'
import type { YearDistance, YearToDate } from './yearToDate'

/** Today is 1 March 2027, the 60th day of a common year. */
const INPUT: HistoryInput = {
  settings: { massKg: 70, bikeMassKg: 9 },
  setAside: new Set<string>(),
  nowMs: Date.UTC(2027, 2, 1, 12),
  gate: undefined,
}

/** A digest with the fields the history reads and nothing of anyone's activity. */
function digest(id: string, startMs: number, fields: Partial<ActivityDigest> = {}): ActivityDigest {
  return {
    modelRevision: MODEL_REVISION,
    id,
    sport: 'run',
    startMs,
    durationS: 3600,
    distanceM: 1000,
    elevationGainM: 0,
    ...fields,
  } as ActivityDigest
}

const at = (year: number, month: number, day = 1, hour = 12) => Date.UTC(year, month - 1, day, hour)

const yearToDateOf = (digests: ActivityDigest[], input: HistoryInput = INPUT): YearToDate =>
  historyOf(digests, input).yearToDate

const rowOf = (data: YearToDate, year: number): YearDistance => {
  const row = data.years.find((candidate) => candidate.year === year)
  if (row === undefined) throw new Error(`no row for ${year}`)
  return row
}

/** A year's cumulative hectometres at a sample day of today's year, or undefined when that sample is not in the list. */
function atDay(row: YearDistance, data: YearToDate, day: number, sport: Sport = 'run') {
  return row.hectometres[sport][data.days.indexOf(day)]
}

describe('yearToDate', () => {
  it('adds the distance of each day into a running total on each sample day of the year', () => {
    const data = yearToDateOf([
      digest('a', at(2025, 1, 10), { distanceM: 5000 }),
      digest('b', at(2025, 1, 20), { distanceM: 3000 }),
    ])
    const row = rowOf(data, 2025)
    expect(atDay(row, data, 7)).toBe(0)
    expect(atDay(row, data, 14)).toBe(50)
    expect(atDay(row, data, 21)).toBe(80)
    expect(atDay(row, data, 364)).toBe(80)
    expect(row.toDate.run).toBe(80)
    expect(row.hectometres.ride.at(-1)).toBe(0)
  })

  it('has a row of zeros for a year between two with activities, and this year last even with none', () => {
    const data = yearToDateOf([digest('a', at(2024, 6)), digest('b', at(2026, 6))])
    expect(data.years.map((row) => row.year)).toEqual([2024, 2025, 2026, 2027])
    expect(rowOf(data, 2025).hectometres.run.every((value) => value === 0)).toBe(true)
    expect(rowOf(data, 2027).hectometres.run).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('stops this year at today, so a day after today is left out of its line and its total', () => {
    const data = yearToDateOf([
      digest('today', at(2027, 3, 1), { distanceM: 2000 }),
      digest('later', at(2027, 3, 2), { distanceM: 9000 }),
    ])
    const row = rowOf(data, 2027)
    expect(data.today).toEqual({ year: 2027, day: 60 })
    expect(row.hectometres.run).toHaveLength(9)
    expect(row.hectometres.run.at(-1)).toBe(20)
    expect(row.toDate.run).toBe(20)
  })

  it('reads a leap year through the same calendar date as today, so its readout is never a day behind', () => {
    const data = yearToDateOf([
      digest('feb29', at(2024, 2, 29), { distanceM: 1000 }),
      digest('mar1', at(2024, 3, 1), { distanceM: 2000 }),
      digest('mar2', at(2024, 3, 2), { distanceM: 4000 }),
    ])
    const row = rowOf(data, 2024)
    expect(row.toDate.run).toBe(30)
    expect(atDay(row, data, 60)).toBe(row.toDate.run)
  })

  it('keeps a common year at its 28 February when today is 29 February, rather than rolling into March', () => {
    const leap = { ...INPUT, nowMs: at(2028, 2, 29) }
    const data = yearToDateOf(
      [
        digest('feb28', at(2027, 2, 28), { distanceM: 1000 }),
        digest('mar1', at(2027, 3, 1), { distanceM: 2000 }),
        digest('today', at(2028, 2, 29), { distanceM: 500 }),
      ],
      leap,
    )
    expect(rowOf(data, 2027).toDate.run).toBe(10)
    expect(rowOf(data, 2028).toDate.run).toBe(5)
  })

  it('reads a leap year’s 31 December with the common year’s, so a leap day does not shift the year end', () => {
    const data = yearToDateOf([
      digest('leap', at(2024, 12, 31), { distanceM: 500 }),
      digest('common', at(2025, 12, 31), { distanceM: 700 }),
    ])
    expect(atDay(rowOf(data, 2024), data, 364)).toBe(0)
    expect(atDay(rowOf(data, 2024), data, 365)).toBe(5)
    expect(atDay(rowOf(data, 2025), data, 365)).toBe(7)
    expect(rowOf(data, 2024).toDate.run).toBe(0)
  })

  it('samples every seventh day, the last two days and today, in ascending order', () => {
    const data = yearToDateOf([digest('a', at(2025, 6))])
    expect(data.days.slice(0, 4)).toEqual([7, 14, 21, 28])
    expect(data.days.slice(-3)).toEqual([364, 365, 366])
    expect(data.days).toContain(60)
    expect(data.days).toEqual([...data.days].sort((a, b) => a - b))
  })

  it('reads the local day of an activity, so one filed for the next day counts in the next year', () => {
    const late = at(2024, 12, 31, 23)
    const filed = yearToDateOf([digest('a', late, { localDayShift: 1, distanceM: 4000 })])
    expect(filed.years.map((row) => row.year)).toEqual([2025, 2026, 2027])
    expect(atDay(rowOf(filed, 2025), filed, 7)).toBe(40)
    expect(yearToDateOf([digest('b', late)]).years[0]!.year).toBe(2024)
    const east = setViewerZone(() => 120)
    try {
      expect(yearToDateOf([digest('c', late)]).years[0]!.year).toBe(2025)
    } finally {
      setViewerZone(east)
    }
  })

  it('adds nothing for a distance the digest could not read', () => {
    const data = yearToDateOf([digest('a', at(2025, 2), { distanceM: NaN })])
    expect(rowOf(data, 2025).toDate.run).toBe(0)
  })

  it('has no years for an empty library, and leaves a day after this year out of every row', () => {
    expect(yearToDateOf([]).years).toEqual([])
    expect(NO_HISTORY.yearToDate.years).toEqual([])
    expect(yearToDateOf([digest('future', at(2030, 5))]).years).toEqual([])
    const data = yearToDateOf([digest('past', at(2025, 1)), digest('future', at(2030, 5))])
    expect(data.years.map((row) => row.year)).toEqual([2025, 2026, 2027])
  })

  it('is remembered for the same day and made again on the next', () => {
    const library = [digest('a', at(2025, 1)), digest('b', at(2026, 1))]
    const first = historyOf(library, INPUT).yearToDate
    expect(historyOf([...library], { ...INPUT, nowMs: INPUT.nowMs + 3_600_000 }).yearToDate).toBe(
      first,
    )
    expect(historyOf(library, { ...INPUT, nowMs: INPUT.nowMs + 86_400_000 }).yearToDate).not.toBe(
      first,
    )
  })
})

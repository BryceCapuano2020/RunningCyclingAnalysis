import { describe, expect, it } from 'vitest'
import { dayOfCivil, setViewerZone, weekOfDay } from '../calendar'
import { MODEL_REVISION } from '../digest/modelRevision'
import type { ActivityDigest, Sport } from '../types'
import { historyOf, NO_HISTORY } from './compute'
import { trainingWeeks } from './calendar'

const INPUT = {
  settings: { massKg: 70, bikeMassKg: 9 },
  setAside: new Set<string>(),
  nowMs: Date.UTC(2030, 0, 1),
  gate: undefined,
}

/**
 * A digest with the fields the calendar reads and nothing of anyone's activity. It has no curve and no power calibration,
 * as a real run without a best effort has none: every part of the history runs over it.
 */
function digest(id: string, startMs: number, fields: Partial<ActivityDigest> = {}): ActivityDigest {
  const sport: Sport = 'run'
  return {
    modelRevision: MODEL_REVISION,
    id,
    sport,
    startMs,
    durationS: 3600,
    distanceM: 10_000,
    elevationGainM: 100,
    curve: [],
    hrBlocks: [],
    calibration: null,
    ...fields,
  } as ActivityDigest
}

const at = (year: number, month: number, day: number, hour = 12) =>
  Date.UTC(year, month - 1, day, hour)
const weeksOf = (...digests: ActivityDigest[]) => trainingWeeks(historyOf(digests, INPUT).calendar)

describe('calendar', () => {
  it('has a cell for every week from the first to the last, a week of rest between as zeros', () => {
    // Monday 4 March 2024 and Wednesday 20 March: two weeks (11 and 18 March) between.
    const weeks = weeksOf(digest('a', at(2024, 3, 4)), digest('b', at(2024, 3, 20)))
    expect(weeks.map((w) => w.mondayDay - dayOfCivil(2024, 2, 4))).toEqual([0, 7, 14])
    expect(weeks.map((w) => w.sports.run.activities)).toEqual([1, 0, 1])
    expect(weeks[1]!.sports.run).toEqual({ hours: 0, activities: 0 })
  })

  it('cuts weeks Monday to Sunday: Sunday night and Monday morning are different weeks', () => {
    const weeks = weeksOf(digest('a', at(2024, 3, 3, 23)), digest('b', at(2024, 3, 4, 1)))
    expect(weeks).toHaveLength(2)
    expect(weeks.map((w) => w.number)).toEqual([9, 10])
  })

  it('adds the days of a week that spans New Year into one cell of the new year', () => {
    // Wednesday 31 December 2025 and Friday 2 January 2026 are one week, of ISO year 2026.
    const weeks = weeksOf(
      digest('a', at(2025, 12, 31), { movingS: 3600 }),
      digest('b', at(2026, 1, 2), { movingS: 5400 }),
    )
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ year: 2026, number: 1, month: 0 })
    expect(weeks[0]!.sports.run).toEqual({ hours: 2.5, activities: 2 })
  })

  it('runs 53 weeks through a long year and on into the next without a gap', () => {
    // 2020 has a week 53 (28 December to 3 January); the next week is week 1 of 2021.
    const weeks = weeksOf(digest('a', at(2020, 12, 30)), digest('b', at(2021, 1, 5)))
    expect(weeks.map((w) => [w.year, w.number])).toEqual([
      [2020, 53],
      [2021, 1],
    ])
    expect(weeks[1]!.week - weeks[0]!.week).toBe(1)
  })

  it('finds the week of 29 February in a leap year', () => {
    const [week] = weeksOf(digest('a', at(2024, 2, 29)))
    expect(week).toMatchObject({ year: 2024, number: 9, month: 1 })
    expect(week!.mondayDay).toBe(dayOfCivil(2024, 1, 26))
    expect(week!.week).toBe(weekOfDay(dayOfCivil(2024, 1, 29)))
  })

  it('keeps each sport’s hours and count apart', () => {
    const [week] = weeksOf(
      digest('a', at(2024, 5, 6), { movingS: 3600 }),
      digest('b', at(2024, 5, 7), { sport: 'ride', durationS: 7200 }),
      digest('c', at(2024, 5, 8), { sport: 'ride', durationS: 1800 }),
    )
    expect(week!.sports.run).toEqual({ hours: 1, activities: 1 })
    expect(week!.sports.ride).toEqual({ hours: 2.5, activities: 2 })
  })

  it('counts a day by the file’s own date, else by the viewer’s zone', () => {
    const lateSunday = at(2024, 3, 3, 23)
    expect(weeksOf(digest('a', lateSunday, { localDayShift: 1 }))[0]!.number).toBe(10)
    expect(weeksOf(digest('b', lateSunday, { localDayShift: 0 }))[0]!.number).toBe(9)
    const utc = setViewerZone(() => 120)
    try {
      expect(weeksOf(digest('c', lateSunday))[0]!.number).toBe(10)
    } finally {
      setViewerZone(utc)
    }
  })

  it('keeps a short activity as a week of training, and holds a count past 63', () => {
    const [short] = weeksOf(digest('a', at(2024, 5, 6), { movingS: 20 }))
    expect(short!.sports.run).toEqual({ hours: 0.1, activities: 1 })
    const many = Array.from({ length: 70 }, (_, i) => digest(`m${i}`, at(2024, 5, 6, 6 + (i % 12))))
    expect(weeksOf(...many)[0]!.sports.run.activities).toBe(63)
  })

  it('is empty for an empty library and for activities of no listed sport', () => {
    expect(historyOf([], INPUT).calendar).toBe(NO_HISTORY.calendar)
    expect(trainingWeeks(NO_HISTORY.calendar)).toEqual([])
    expect(weeksOf(digest('a', at(2024, 5, 6), { sport: 'swim' as Sport }))).toEqual([])
  })

  it('is remembered for the same digests, whatever else changes, and made again for others', () => {
    const library = [digest('a', at(2020, 1, 6)), digest('b', at(2021, 1, 6))]
    const first = historyOf(library, INPUT)
    expect(historyOf([...library], { ...INPUT, nowMs: INPUT.nowMs + 1 }).calendar).toBe(
      first.calendar,
    )
    expect(historyOf(library.slice(0, 1), INPUT).calendar).not.toBe(first.calendar)
  })

  it('stays a few kilobytes for twelve years of weeks of both sports', () => {
    const weeksOfTwelveYears = 12 * 52
    const library = Array.from({ length: weeksOfTwelveYears }, (_, i) => [
      digest(`r${i}`, at(2012, 1, 2) + i * 7 * 86_400_000, { movingS: 3600 + i * 7 }),
      digest(`b${i}`, at(2012, 1, 3) + i * 7 * 86_400_000, { sport: 'ride', durationS: 5400 }),
    ]).flat()
    const { calendar } = historyOf(library, INPUT)
    expect(trainingWeeks(calendar)).toHaveLength(weeksOfTwelveYears)
    expect(JSON.stringify(calendar).length).toBeLessThan(5000)
  })
})

import { describe, expect, it } from 'vitest'
import { setViewerZone } from '../calendar'
import { MODEL_REVISION } from '../digest/modelRevision'
import type { ActivityDigest, Sport } from '../types'
import { historyOf, NO_HISTORY } from './compute'

const INPUT = {
  settings: { massKg: 70, bikeMassKg: 9 },
  setAside: new Set<string>(),
  nowMs: Date.UTC(2030, 0, 1),
  gate: undefined,
}

/** A digest with the fields the history reads and nothing of anyone's activity. */
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
    ...fields,
  } as ActivityDigest
}

const at = (year: number, month: number, day = 1, hour = 12) => Date.UTC(year, month - 1, day, hour)
const yearsOf = (...digests: ActivityDigest[]) => historyOf(digests, INPUT).years

describe('years', () => {
  it('totals the hours, distance, climb and count of each sport in each calendar year', () => {
    const rows = yearsOf(
      digest('a', at(2020, 3), { movingS: 5400, distanceM: 9000, elevationGainM: 50 }),
      digest('b', at(2020, 9), { durationS: 1800, distanceM: 4000, elevationGainM: 20 }),
      digest('c', at(2021, 5), {
        sport: 'ride',
        durationS: 7200,
        distanceM: 50_000,
        elevationGainM: 600,
      }),
    )
    expect(rows.map((row) => row.year)).toEqual([2020, 2021])
    // Moving time when the digest keeps it, else elapsed time.
    expect(rows[0]!.sports.run).toEqual({ hours: 2, distanceM: 13_000, climbM: 70, activities: 2 })
    expect(rows[0]!.sports.ride.activities).toBe(0)
    expect(rows[1]!.sports.ride).toEqual({
      hours: 2,
      distanceM: 50_000,
      climbM: 600,
      activities: 1,
    })
  })

  it('has a row of zeros for a year between two that have activities, and none without any', () => {
    const rows = yearsOf(digest('a', at(2018, 6)), digest('b', at(2021, 6)))
    expect(rows.map((row) => row.year)).toEqual([2018, 2019, 2020, 2021])
    expect(rows[1]!.sports.run.activities).toBe(0)
    expect(yearsOf()).toEqual(NO_HISTORY.years)
  })

  it('counts a day by the file’s own date, else by the viewer’s zone', () => {
    const late = at(2021, 12, 31, 23)
    expect(yearsOf(digest('a', late, { localDayShift: 1 }))[0]!.year).toBe(2022)
    expect(yearsOf(digest('b', late, { localDayShift: 0 }))[0]!.year).toBe(2021)
    const utc = setViewerZone(() => 120)
    try {
      expect(yearsOf(digest('c', late))[0]!.year).toBe(2022)
    } finally {
      setViewerZone(utc)
    }
  })

  it('adds nothing for a distance or climb the digest could not read', () => {
    const [row] = yearsOf(digest('a', at(2022, 1), { distanceM: NaN, elevationGainM: NaN }))
    expect(row!.sports.run).toMatchObject({ distanceM: 0, climbM: 0, activities: 1 })
  })

  it('is remembered for the same digests, whatever else changes, and made again for others', () => {
    const library = [digest('a', at(2020, 1)), digest('b', at(2021, 1))]
    const first = historyOf(library, INPUT)
    expect(historyOf([...library], { ...INPUT, nowMs: INPUT.nowMs + 1 }).years).toBe(first.years)
    expect(historyOf(library.slice(0, 1), INPUT).years).not.toBe(first.years)
  })
})

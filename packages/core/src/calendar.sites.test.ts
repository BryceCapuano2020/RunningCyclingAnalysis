import { describe, expect, it } from 'vitest'
import { withLocalWeeks, weekEndMs } from './calendar'
import { DAY_MS } from './constants'
import { sameHeartRate } from './digest/sameHeartRate'
import { fitnessTrend } from './digest/trend'
import { buildTables } from './findings/tables'
import { weeklyMarks } from './findings/input'
import { plantedLibrary } from './findings/test/plantedLibrary'
import { zoneTablesOf } from './findings/zoneTables'
import type { ActivityDigest } from './types'

/**
 * The sites that cut a library into weeks, read with local weeks on. Each is given an activity whose local day
 * is not its UTC day, and must put it in the week of its local day; with every shift 0 each must give exactly
 * the figures it gives with local weeks off.
 */
const library = plantedLibrary({
  seed: 4,
  weeks: 20,
  perWeek: 4,
  noise: 0.02,
  sports: ['run', 'ride'],
  effects: [],
})
const SETTINGS = { massKg: 70, bikeMassKg: 9 }

/** Sunday 15 March 2026 20:00 UTC: Monday 16 March in any zone from +4 h. */
const SUNDAY_EVENING = Date.UTC(2026, 2, 15, 20)
const SUNDAY_END = Date.UTC(2026, 2, 16) - 1

const withShift = (digest: ActivityDigest, localDayShift: -1 | 0 | 1): ActivityDigest => ({
  ...digest,
  localDayShift,
})
const allShifted = (shift: -1 | 0 | 1) => library.digests.map((d) => withShift(d, shift))

describe('with every shift 0, local weeks give the figures of UTC weeks', () => {
  it('for the findings tables, the weekly marks and the same-heart-rate weeks', () => {
    const utc = {
      tables: buildTables(library.digests, new Set(), library.lastMs),
      marks: weeklyMarks(library.digests),
      same: sameHeartRate(library.digests, new Set(), {}),
    }
    withLocalWeeks(true, () => {
      const digests = allShifted(0)
      const tables = buildTables(digests, new Set(), library.lastMs)
      expect(tables.weeklyMoving).toEqual(utc.tables.weeklyMoving)
      expect(tables.coverage).toEqual(utc.tables.coverage)
      expect(weeklyMarks(digests)).toEqual(utc.marks)
      expect(sameHeartRate(digests, new Set(), {})).toEqual(utc.same)
    })
  })

  it('for the weekly trend', () => {
    const utc = fitnessTrend(library.digests, SETTINGS)
    withLocalWeeks(true, () => {
      expect(fitnessTrend(allShifted(0), SETTINGS).map((p) => p.endMs)).toEqual(
        utc.map((p) => p.endMs),
      )
    })
  })
})

describe('an activity whose local day is the next', () => {
  /** The library with its last run moved to Sunday evening UTC, with the shift the zone would give it. */
  function withLateRun(shift: -1 | 0 | 1): ActivityDigest[] {
    const last = library.digests.at(-1)!
    return [
      ...library.digests.slice(0, -1),
      { ...last, startMs: SUNDAY_EVENING + 10 * 7 * DAY_MS, localDayShift: shift },
    ]
  }
  const week = (endMs: number) => endMs

  it('is counted in the later week by the findings tables, and the earlier with local weeks off', () => {
    const moved = withLateRun(1)
    const sundayEnd = week(SUNDAY_END + 10 * 7 * DAY_MS)
    const last = moved.at(-1)!
    const rowOf = (sport: 'run' | 'ride', endMs: number) =>
      buildTables(moved, new Set(), last.startMs + 7 * DAY_MS).weeklyMoving[sport].find(
        (w) => w.endMs === endMs,
      )
    const inUtcWeek = rowOf(last.sport, sundayEnd)?.activities ?? 0
    withLocalWeeks(true, () => {
      const inEarlier = rowOf(last.sport, sundayEnd)?.activities ?? 0
      const inLater = rowOf(last.sport, sundayEnd + 7 * DAY_MS)?.activities ?? 0
      expect(inEarlier).toBe(inUtcWeek - 1)
      expect(inLater).toBe(1)
    })
  })

  it('ends the weekly marks and the trend a week later', () => {
    const moved = withLateRun(1)
    const sundayEnd = SUNDAY_END + 10 * 7 * DAY_MS
    expect(weeklyMarks(moved).at(-1)).toBe(sundayEnd)
    expect(fitnessTrend(moved, SETTINGS).at(-1)!.endMs).toBe(sundayEnd)
    withLocalWeeks(true, () => {
      expect(weeklyMarks(moved).at(-1)).toBe(sundayEnd + 7 * DAY_MS)
      expect(fitnessTrend(moved, SETTINGS).at(-1)!.endMs).toBe(sundayEnd + 7 * DAY_MS)
    })
  })

  it('is counted in the later week by the zone tables', () => {
    const base = { id: 'a', sport: 'run' as const, movingS: 100, easyS: 100, middleS: 0, hardS: 0 }
    const activity = { ...base, startMs: SUNDAY_EVENING, zoneReferenceBpm: 170 }
    expect(zoneTablesOf([activity]).weeks.run[0]!.endMs).toBe(SUNDAY_END)
    withLocalWeeks(true, () => {
      expect(zoneTablesOf([{ ...activity, localDayShift: 1 }]).weeks.run[0]!.endMs).toBe(
        SUNDAY_END + 7 * DAY_MS,
      )
      expect(zoneTablesOf([{ ...activity, localDayShift: 0 }]).weeks.run[0]!.endMs).toBe(
        weekEndMs(SUNDAY_EVENING),
      )
    })
  })
})

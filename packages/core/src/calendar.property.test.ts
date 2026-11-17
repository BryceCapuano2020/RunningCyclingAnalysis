import { describe, expect, it } from 'vitest'
import {
  civilOfDay,
  dayOfCivil,
  endOfLocalDay,
  localDayOfInstant,
  mondayOfWeek,
  mondayOnOrBefore,
  startOfLocalDay,
  weekOfDay,
  withViewerZone,
  type Zone,
} from './calendar'
import { DAY_MS } from './constants'
import { periodOf, splitPeriods, type PeriodChoice } from './period'
import { check, fc } from './test/property'
import { dstZone } from './test/zones'
import { snapshotCorpus } from './test/snapshotCorpus'

/*
 * Days, weeks and periods are cut in the viewer's zone. Whatever the zone, an instant is in exactly one local day, days
 * follow one another without a gap or an overlap, a day belongs to exactly one Monday-start week, and a period holds each
 * activity once. Zones are fixed offsets in whole minutes (half and three-quarter hours too) and a zone with clock changes.
 */

const fixed =
  (minutes: number): Zone =>
  () =>
    minutes
const zone = fc.oneof(fc.integer({ min: -720, max: 840 }).map(fixed), fc.constant(dstZone))
// 2025 and 2026, where `dstZone` has its clock changes.
const instant = fc.integer({ min: Date.UTC(2025, 0, 1), max: Date.UTC(2026, 11, 31) })

describe('local days', () => {
  it('puts an instant in exactly one day, and the days follow each other', () => {
    check(
      fc.property(zone, instant, (z, ms) =>
        withViewerZone(z, () => {
          const day = localDayOfInstant(ms)
          const start = startOfLocalDay(ms)
          const end = endOfLocalDay(ms)
          expect(start).toBeLessThanOrEqual(ms)
          expect(end).toBeGreaterThanOrEqual(ms)
          expect(localDayOfInstant(start)).toBe(day)
          expect(localDayOfInstant(end)).toBe(day)
          expect(localDayOfInstant(start - 1)).toBe(day - 1)
          expect(localDayOfInstant(end + 1)).toBe(day + 1)
          expect(endOfLocalDay(start - 1)).toBe(start - 1)
        }),
      ),
      300,
    )
  })

  it('never runs backwards: a later instant is on the same day or a later one', () => {
    check(
      fc.property(zone, instant, fc.integer({ min: 0, max: 3 * DAY_MS }), (z, ms, later) =>
        withViewerZone(z, () => {
          expect(localDayOfInstant(ms + later)).toBeGreaterThanOrEqual(localDayOfInstant(ms))
        }),
      ),
      300,
    )
  })
})

describe('day numbers and weeks', () => {
  it('round-trips a day through its civil date', () => {
    check(
      fc.property(fc.integer({ min: -40_000, max: 80_000 }), (day) => {
        const { year, month, date } = civilOfDay(day)
        expect(dayOfCivil(year, month, date)).toBe(day)
      }),
      300,
    )
  })

  it('puts every day in one Monday-start week of seven days', () => {
    check(
      fc.property(fc.integer({ min: -40_000, max: 80_000 }), (day) => {
        const week = weekOfDay(day)
        expect(mondayOfWeek(week)).toBeLessThanOrEqual(day)
        expect(day).toBeLessThan(mondayOfWeek(week + 1))
        expect(mondayOnOrBefore(day)).toBe(mondayOfWeek(week))
        expect(new Date(mondayOfWeek(week) * DAY_MS).getUTCDay()).toBe(1)
      }),
      300,
    )
  })
})

describe('periods', () => {
  const library = snapshotCorpus()[1]!.digests
  const choice = fc.oneof(
    fc.constantFrom<PeriodChoice>('all', 'default'),
    fc.integer({ min: 1, max: 200 }),
  )

  it('holds each activity of its days once, and the period before it does not overlap', () => {
    check(
      fc.property(zone, choice, fc.integer({ min: 0, max: 400 }), (z, picked, resolved) =>
        withViewerZone(z, () => {
          const { period, selected, previous } = splitPeriods(library, picked, resolved || 'all')
          expect(period.startMs).not.toBeNull()
          expect(period.startMs!).toBeLessThanOrEqual(period.endMs!)
          for (const d of selected) {
            expect(d.startMs).toBeGreaterThanOrEqual(period.startMs!)
            expect(d.startMs).toBeLessThanOrEqual(period.endMs!)
          }
          const inRange = library.filter(
            (d) => d.startMs >= period.startMs! && d.startMs <= period.endMs!,
          )
          expect(selected.map((d) => d.id)).toStrictEqual(inRange.map((d) => d.id))
          const ids = new Set(selected.map((d) => d.id))
          expect(ids.size).toBe(selected.length)
          for (const d of previous) {
            expect(ids.has(d.id)).toBe(false)
            expect(d.startMs).toBeLessThan(period.startMs!)
          }
          if (period.days === null) expect(previous).toEqual([])
          expect(periodOf(library, picked, resolved || 'all')).toStrictEqual(period)
        }),
      ),
      200,
    )
  })
})

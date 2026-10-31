import { describe, expect, it } from 'vitest'
import { localAxisMs, setViewerZone, weekEndFor, weekEndInstant, weekEndsSpan } from './calendar'
import type { Zone } from './calendar'
import { DAY_MS } from './constants'
import { fitnessTrend } from './digest/trend'
import { inputAt, weeklyMarks } from './findings/input'
import { buildTables } from './findings/tables'
import { plantedLibrary } from './findings/test/plantedLibrary'
import type { ActivityDigest } from './types'

/**
 * Windows and spans cut at week ends, with local weeks on. A week end is a label on the axis of local days, so an
 * instant (a start, an as-of date) is compared with it only through `localAxisMs` or `weekEndInstant`.
 */
const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min)
const east =
  (hours: number): Zone =>
  () =>
    hours * 60

/** A zone from the platform's time zone database, minutes east of UTC at an instant. */
function named(timeZone: string): Zone {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  return (ms) => {
    const part = Object.fromEntries(format.formatToParts(ms).map((p) => [p.type, Number(p.value)]))
    const local = Date.UTC(
      part.year!,
      part.month! - 1,
      part.day!,
      part.hour!,
      part.minute!,
      part.second!,
    )
    return Math.round((local - Math.floor(ms / 1000) * 1000) / 60_000)
  }
}

const changed = (d: ActivityDigest, patch: Partial<ActivityDigest>): ActivityDigest =>
  Object.assign({}, d, patch)

const library = plantedLibrary({
  seed: 9,
  weeks: 14,
  perWeek: 3,
  noise: 0.02,
  sports: ['run', 'ride'],
  effects: [],
})
const SETTINGS = { massKg: 70, bikeMassKg: 9 }
// Sunday 15 March 2026, 18:00 at UTC-7 is Monday 16 March 01:00 UTC.
const SUNDAY_END = at(2026, 3, 16) - 1
const SUNDAY_EVENING_LOCAL = at(2026, 3, 16, 1)

describe('the week axis and the week end agree', () => {
  it('puts a start at or before a week end exactly when its week ends at or before it', () => {
    {
      for (let hours = -12; hours <= 14; hours += 1.25) {
        const zone = east(hours)
        for (let step = 0; step < 400; step++) {
          const item = { startMs: at(2026, 1, 1) + step * 5 * 3600_000 + 777 }
          for (const shift of [undefined, -1, 0, 1] as const) {
            const dated = shift === undefined ? item : { ...item, localDayShift: shift }
            const end = weekEndFor(dated, zone)
            expect(localAxisMs(dated, zone) <= end, `${hours} ${step} ${shift}`).toBe(true)
            expect(localAxisMs(dated, zone) > end - 7 * DAY_MS, `${hours} ${step} ${shift}`).toBe(
              true,
            )
          }
        }
      }
    }
  })

  it('puts a Sunday evening at UTC-7 on Sunday’s axis, though its UTC day is Monday', () => {
    expect(localAxisMs({ startMs: SUNDAY_EVENING_LOCAL, localDayShift: -1 })).toBe(
      SUNDAY_EVENING_LOCAL - DAY_MS,
    )
  })

  it('gives the instant a week ends at in a zone with a daylight saving change', () => {
    const zone = named('America/Los_Angeles')
    {
      // Sunday 8 March 2026, the spring-forward day: the week ends at 06:59:59.999 UTC on Monday 9 March.
      const label = at(2026, 3, 9) - 1
      expect(weekEndInstant(label, zone)).toBe(at(2026, 3, 9, 6, 59) + 59_999)
      // Sunday 1 November 2026, the fall-back day: the week ends at 07:59:59.999 UTC.
      expect(weekEndInstant(at(2026, 11, 2) - 1, zone)).toBe(at(2026, 11, 2, 7, 59) + 59_999)
      // And the end of that instant's local Sunday is the same week.
      expect(weekEndFor({ startMs: weekEndInstant(label, zone) }, zone)).toBe(label)
    }
  })
})

describe('weekEndsSpan', () => {
  it('reads the first and last week from the weeks, not from the order of the starts', () => {
    {
      // Starts in order: b (Sunday 23:30 UTC, local Monday) then a (Monday 00:30 UTC, local Sunday).
      const b = { startMs: at(2026, 3, 15, 23, 30), localDayShift: 1 as const }
      const a = { startMs: at(2026, 3, 16, 0, 30), localDayShift: -1 as const }
      expect(weekEndsSpan([b, a])).toEqual({
        first: at(2026, 3, 16) - 1,
        last: at(2026, 3, 23) - 1,
      })
    }
  })
})

/** The library with one activity moved to a Sunday evening at UTC-7 (Monday 01:00 UTC, shift -1). */
function withSundayEvening(): ActivityDigest[] {
  const last = library.digests.at(-1)!
  return [
    ...library.digests.slice(0, -1),
    changed(last, { startMs: SUNDAY_EVENING_LOCAL, localDayShift: -1 }),
  ]
    .map((d) =>
      d.startMs === SUNDAY_EVENING_LOCAL ? d : changed(d, { startMs: d.startMs - 40 * 7 * DAY_MS }),
    )
    .sort((x, y) => x.startMs - y.startMs || (x.id < y.id ? -1 : 1))
}

describe('a Sunday evening at UTC-7', () => {
  const count = (points: ReturnType<typeof fitnessTrend>) =>
    points.map((p) => p.runCount + p.rideCount)

  it('stays in its own week in the final trend point', () => {
    const evening = withSundayEvening()
    {
      const points = fitnessTrend(evening, SETTINGS)
      expect(points.at(-1)!.endMs).toBe(SUNDAY_END)
      // The same activity at midday UTC on that Sunday is in the same week and the same windows.
      const midday = evening.map((d) =>
        d.startMs === SUNDAY_EVENING_LOCAL
          ? changed(d, { startMs: at(2026, 3, 15, 12), localDayShift: 0 })
          : d,
      )
      expect(count(fitnessTrend(midday, SETTINGS))).toEqual(count(points))
    }
  })

  it('is cut into weeks by the weekly marks and tables with the same end', () => {
    const evening = withSundayEvening()
    {
      const restore = setViewerZone(east(-7))
      try {
        const marks = weeklyMarks(evening)
        expect(marks.at(-1)).toBe(weekEndInstant(SUNDAY_END))
        const asOf = marks.at(-1)!
        const last = buildTables(evening, new Set(), asOf).weeklyMoving
        const ends = [...last.run, ...last.ride].map((w) => w.endMs)
        expect(Math.max(...ends)).toBe(SUNDAY_END)
        const row = [...last.run, ...last.ride].find((w) => w.endMs === SUNDAY_END && w.complete)
        expect(row?.activities).toBe(1)
        // The activity is in the input at that mark, which an instant compared with the label would drop.
        const input = inputAt({ digests: evening, setAside: new Set() }, asOf)
        expect(input.digests.some((d) => d.startMs === SUNDAY_EVENING_LOCAL)).toBe(true)
      } finally {
        setViewerZone(restore)
      }
    }
  })
})

describe('answers remembered by digests', () => {
  it('are not served to a reader in another zone', () => {
    // One run each Monday at 02:00 UTC: Sunday evening at UTC-7, so a west zone moves every run a week earlier.
    const runs = plantedLibrary({
      seed: 2,
      weeks: 10,
      perWeek: 3,
      noise: 0.02,
      sports: ['run'],
      effects: [],
    }).digests.map((d, i) =>
      changed(d, { startMs: SUNDAY_EVENING_LOCAL + i * 7 * DAY_MS + 3600_000 }),
    )
    const ends = () => fitnessTrend(runs, SETTINGS).map((p) => p.endMs)
    {
      const utc = ends()
      const restore = setViewerZone(east(-7))
      try {
        const west = ends()
        expect(west).not.toEqual(utc)
        expect(ends()).toEqual(west)
      } finally {
        setViewerZone(restore)
      }
      expect(ends()).toEqual(utc)
    }
  })
})

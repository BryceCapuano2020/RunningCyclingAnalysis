import { describe, expect, it } from 'vitest'
import {
  localDayNumber,
  localWeeksOn,
  setViewerZone,
  shiftFromZone,
  UTC_ZONE,
  weekEndFor,
  weekEndMs,
  weekEndsSpan,
  weekOfDay,
  withLocalWeeks,
} from './calendar'
import { DAY_MS } from './constants'
import type { Zone } from './calendar'

/** The UTC week end as the app computed it before calendar.ts: through `Date`'s UTC fields. */
function weekEndThroughDate(ms: number): number {
  const date = new Date(ms)
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const daysToSunday = (7 - date.getUTCDay()) % 7
  return dayStart + (daysToSunday + 1) * DAY_MS - 1
}

const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min)
const east =
  (hours: number): Zone =>
  () =>
    hours * 60

describe('weekEndMs', () => {
  it('is the Sunday 23:59:59.999 UTC that ends the Monday to Sunday week, as before', () => {
    for (let day = -40; day < 9000; day += 3) {
      for (const offset of [0, 1, 12 * 3600_000, DAY_MS - 1]) {
        const ms = day * DAY_MS + offset
        expect(weekEndMs(ms), String(ms)).toBe(weekEndThroughDate(ms))
      }
    }
  })

  it('puts Monday 00:00 UTC in the new week and Sunday 23:59:59.999 in the old', () => {
    const monday = at(2026, 3, 16)
    expect(weekEndMs(monday - 1)).toBe(monday - 1)
    expect(weekEndMs(monday)).toBe(monday + 7 * DAY_MS - 1)
  })

  it('counts weeks from Monday 5 January 1970', () => {
    expect(weekOfDay(4)).toBe(0)
    expect(weekOfDay(3)).toBe(-1)
    expect(weekOfDay(10)).toBe(0)
    expect(weekOfDay(11)).toBe(1)
  })
})

describe('shiftFromZone and localDayNumber', () => {
  it('gives the local date less the UTC date for a zone', () => {
    expect(shiftFromZone(east(9), at(2026, 3, 14, 20))).toBe(1)
    expect(shiftFromZone(east(5.5), at(2026, 3, 14, 12))).toBe(0)
    expect(shiftFromZone(east(-7), at(2026, 3, 15, 6, 30))).toBe(-1)
    expect(shiftFromZone(UTC_ZONE, at(2026, 3, 14, 20))).toBe(0)
  })

  it('O7: takes the file’s shift first, and the zone only where the file gave none', () => {
    const start = at(2026, 3, 14, 20)
    const day = Math.floor(start / DAY_MS)
    expect(localDayNumber({ startMs: start, localDayShift: 0 }, east(9))).toBe(day)
    expect(localDayNumber({ startMs: start, localDayShift: 1 }, east(0))).toBe(day + 1)
    expect(localDayNumber({ startMs: start }, east(9))).toBe(day + 1)
    expect(localDayNumber({ startMs: start }, east(0))).toBe(day)
  })

  it('reads the viewer’s zone, set once, and puts the old one back', () => {
    const start = at(2026, 3, 14, 20)
    const before = setViewerZone(east(9))
    try {
      expect(localDayNumber({ startMs: start })).toBe(Math.floor(start / DAY_MS) + 1)
    } finally {
      setViewerZone(before)
    }
    expect(localDayNumber({ startMs: start })).toBe(Math.floor(start / DAY_MS))
  })

  it('does not follow the process zone, however TZ is set', () => {
    const start = at(2026, 3, 14, 20)
    expect(localDayNumber({ startMs: start })).toBe(Math.floor(start / DAY_MS))
  })
})

describe('weekEndFor', () => {
  // Sunday 15 March 2026 is the last day of its week; Monday 16 March starts the next.
  const sundayEnd = at(2026, 3, 16) - 1
  const nextSundayEnd = sundayEnd + 7 * DAY_MS

  it('is the UTC week of the start while local weeks are off, whatever shift the file gave', () => {
    expect(localWeeksOn()).toBe(false)
    expect(weekEndFor({ startMs: at(2026, 3, 16, 6, 30), localDayShift: -1 })).toBe(nextSundayEnd)
    expect(weekEndFor({ startMs: at(2026, 3, 15, 11, 30), localDayShift: 1 })).toBe(sundayEnd)
  })

  it('O9: puts Sunday 23:30 local at UTC-7 in Sunday’s week, though its UTC day is Monday', () => {
    withLocalWeeks(true, () => {
      expect(weekEndFor({ startMs: at(2026, 3, 16, 6, 30), localDayShift: -1 })).toBe(sundayEnd)
    })
  })

  it('O9: puts Monday 00:30 local at UTC+13 in Monday’s week, though its UTC day is Sunday', () => {
    withLocalWeeks(true, () => {
      expect(weekEndFor({ startMs: at(2026, 3, 15, 11, 30), localDayShift: 1 })).toBe(nextSundayEnd)
    })
  })

  it('falls back to the viewer’s zone for a file that gave no shift', () => {
    const before = setViewerZone(east(13))
    try {
      withLocalWeeks(true, () => {
        expect(weekEndFor({ startMs: at(2026, 3, 15, 11, 30) })).toBe(nextSundayEnd)
        expect(weekEndFor({ startMs: at(2026, 3, 15, 10, 30) })).toBe(sundayEnd)
      })
    } finally {
      setViewerZone(before)
    }
  })

  it('agrees with weekEndMs for a shift of 0', () => {
    withLocalWeeks(true, () => {
      for (let day = 0; day < 400; day += 5) {
        const startMs = at(2026, 1, 1) + day * DAY_MS + 7 * 3600_000
        expect(weekEndFor({ startMs, localDayShift: 0 })).toBe(weekEndMs(startMs))
      }
    })
  })

  it('holds the setting only inside the run, and refuses one that waits', () => {
    expect(withLocalWeeks(true, () => localWeeksOn())).toBe(true)
    expect(localWeeksOn()).toBe(false)
    expect(() => withLocalWeeks(true, () => Promise.resolve())).toThrow(TypeError)
    expect(localWeeksOn()).toBe(false)
  })
})

describe('weekEndsSpan', () => {
  it('is null for no activities', () => {
    expect(weekEndsSpan([])).toBeNull()
  })

  it('takes the earliest and latest week, not those of the first and last start', () => {
    // By start, the Monday 00:10 UTC run is first; its local day is Monday. The later run starts in the same UTC
    // hour but is on the Sunday before in its own zone, so its week is the earlier one.
    const first = { startMs: at(2026, 3, 16, 0, 10), localDayShift: 0 as const }
    const second = { startMs: at(2026, 3, 16, 1, 0), localDayShift: -1 as const }
    const sundayEnd = at(2026, 3, 16) - 1
    withLocalWeeks(true, () => {
      expect(weekEndsSpan([first, second])).toEqual({
        first: sundayEnd,
        last: sundayEnd + 7 * DAY_MS,
      })
    })
    expect(weekEndsSpan([first, second])).toEqual({
      first: sundayEnd + 7 * DAY_MS,
      last: sundayEnd + 7 * DAY_MS,
    })
  })
})

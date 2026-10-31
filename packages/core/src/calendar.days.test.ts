import { describe, expect, it } from 'vitest'
import {
  calendarDays,
  dayZoneKey,
  daysBefore,
  endOfLocalDay,
  localDateText,
  localDayOfInstant,
  localYearOf,
  setViewerZone,
  startOfDayText,
  startOfLocalDay,
  startOfRealDay,
  withLocalWeeks,
} from './calendar'
import type { Zone } from './calendar'
import { DAY_MS } from './constants'
import { localDateOf, localDayStartMs } from './athlete/measurements'
import { dayOf, dayStartMs } from './customRange'
import { ageAt } from './grade/ageGrade'
import { windowEnding } from './period'

const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) =>
  Date.UTC(y, m - 1, d, h, min, s, ms)
const HOUR = 3_600_000
const fixed =
  (hours: number): Zone =>
  () =>
    hours * 60

/** New York in 2026: five hours behind until 2 a.m. on 8 March (07:00 UTC), four after, until 1 November. */
const newYork: Zone = (ms) =>
  ms < at(2026, 3, 8, 7) ? -300 : ms < at(2026, 11, 1, 6) ? -240 : -300

/** Runs `run` with local weeks on and the viewer in `zone`, then puts both back. */
function inZone<T>(zone: Zone, run: () => T): T {
  const before = setViewerZone(zone)
  try {
    return withLocalWeeks(true, run)
  } finally {
    setViewerZone(before)
  }
}

describe('the days of a period in the viewer’s zone', () => {
  it('start and end at local midnight in a fixed zone, whatever the process zone is', () => {
    inZone(fixed(9), () => {
      const evening = at(2026, 3, 14, 20)
      // 20:00 UTC is 05:00 on the 15th at +9: the day began at 15:00 UTC on the 14th.
      expect(startOfLocalDay(evening)).toBe(at(2026, 3, 14, 15))
      expect(endOfLocalDay(evening)).toBe(at(2026, 3, 15, 15) - 1)
      expect(localDayOfInstant(evening)).toBe(Math.floor(at(2026, 3, 15) / DAY_MS))
    })
    inZone(fixed(-7), () => {
      const early = at(2026, 3, 15, 6, 30)
      expect(startOfLocalDay(early)).toBe(at(2026, 3, 14, 7))
      expect(endOfLocalDay(early)).toBe(at(2026, 3, 15, 7) - 1)
    })
  })

  it('O8: has a 23 hour day when the clocks go forward, and keeps the time of day across it', () => {
    inZone(newYork, () => {
      const spring = at(2026, 3, 8, 12)
      expect(startOfLocalDay(spring)).toBe(at(2026, 3, 8, 5))
      expect(endOfLocalDay(spring)).toBe(at(2026, 3, 9, 4) - 1)
      expect(endOfLocalDay(spring) + 1 - startOfLocalDay(spring)).toBe(23 * HOUR)
      // Noon on the 10th (16:00 UTC), seven days back, is noon on the 3rd (17:00 UTC).
      expect(daysBefore(at(2026, 3, 10, 16), 7)).toBe(at(2026, 3, 3, 17))
      expect(calendarDays(at(2026, 3, 1, 12), at(2026, 3, 10, 16))).toBe(10)
    })
  })

  it('has a 25 hour day when the clocks go back', () => {
    inZone(newYork, () => {
      const fall = at(2026, 11, 1, 12)
      expect(endOfLocalDay(fall) + 1 - startOfLocalDay(fall)).toBe(25 * HOUR)
    })
  })

  it('gives a window of days that ends on the newest activity’s day, in the zone given', () => {
    inZone(fixed(9), () => {
      const newest = at(2026, 3, 14, 20)
      const { startMs, endMs } = windowEnding(newest, 7)
      expect(startMs).toBe(at(2026, 3, 8, 15))
      expect(endMs).toBe(at(2026, 3, 15, 15) - 1)
    })
  })

  it('O11: holds the same activities in a 12-week period under a zone given once, not the process’s', () => {
    // The answers are closed-form in the zone: nothing here reads Date's, so TZ cannot move them.
    for (const zone of [fixed(0), fixed(9), fixed(-7), newYork]) {
      inZone(zone, () => {
        const { startMs, endMs } = windowEnding(at(2026, 5, 20, 3), 12 * 7)
        expect(calendarDays(startMs, endMs)).toBe(84)
        expect(startOfLocalDay(startMs)).toBe(startMs)
        expect(startOfLocalDay(endMs)).toBe(startOfLocalDay(at(2026, 5, 20, 3)))
      })
    }
  })
})

describe('dates as text in the viewer’s zone', () => {
  it('names the local day of an instant', () => {
    inZone(fixed(9), () => {
      expect(localDateText(at(2026, 3, 14, 20))).toBe('2026-03-15')
      expect(dayOf(at(2026, 3, 14, 20))).toBe('2026-03-15')
      expect(localDateOf(at(2026, 3, 14, 14))).toBe('2026-03-14')
    })
  })

  it('finds the midnight a text names, and refuses a day that is not one', () => {
    inZone(fixed(9), () => {
      expect(dayStartMs('2026-03-15')).toBe(at(2026, 3, 14, 15))
      expect(localDayStartMs('2026-03-15')).toBe(at(2026, 3, 14, 15))
      expect(startOfDayText('2026-03-15')).toBe(at(2026, 3, 14, 15))
      expect(dayStartMs('2026-06-31')).toBeNull()
      expect(dayStartMs('2027-02-29')).toBeNull()
      expect(startOfRealDay(2028, 2, 29)).toBe(at(2028, 2, 28, 15))
    })
  })

  it('reads a text back to its day: the start of a day is on that day', () => {
    inZone(newYork, () => {
      for (const day of ['2026-03-08', '2026-03-09', '2026-11-01', '2026-12-31']) {
        expect(localDateText(startOfDayText(day))).toBe(day)
        expect(localDateText(startOfDayText(day) - 1)).not.toBe(day)
      }
    })
  })
})

describe('age in the viewer’s zone', () => {
  it('O10: changes year at local midnight on 31 December, not at UTC’s', () => {
    // 23:30 UTC on 31 December 2025 is 08:30 on 1 January 2026 at +9, and still 2025 at UTC-7.
    const newYear = at(2025, 12, 31, 23, 30)
    inZone(fixed(9), () => {
      expect(localYearOf(newYear)).toBe(2026)
      expect(ageAt(1990, newYear)).toBe(36)
    })
    inZone(fixed(-7), () => {
      expect(localYearOf(newYear)).toBe(2025)
      expect(ageAt(1990, newYear)).toBe(35)
    })
  })
})

describe('the zone’s key', () => {
  it('changes when the viewer is given another zone, so a result kept for one is not taken for another', () => {
    const keys = new Set<string>()
    withLocalWeeks(true, () => {
      const before = setViewerZone(fixed(1))
      keys.add(dayZoneKey())
      setViewerZone(fixed(1))
      keys.add(dayZoneKey())
      setViewerZone(before)
    })
    expect(keys.size).toBe(2)
  })

  it('is the device’s zone name while local weeks are off', () => {
    expect(dayZoneKey()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})

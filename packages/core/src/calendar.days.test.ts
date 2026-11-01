import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calendarDays,
  dayZoneKey,
  daysBefore,
  endOfLocalDay,
  localDateText,
  localDayOfInstant,
  localYearOf,
  noonOnLabelDate,
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
import { thresholdAt } from './digest/thresholdTimelineTypes'
import type { ThresholdStep } from './digest/thresholdTimelineTypes'

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

  describe('while local weeks are off', () => {
    type Env = { env: Record<string, string | undefined> }
    const env = (globalThis as { process?: Env }).process!.env
    const saved = env.TZ
    afterEach(() => {
      if (saved === undefined) delete env.TZ
      else env.TZ = saved
    })
    const keyIn = (zone: string) => {
      env.TZ = zone
      return dayZoneKey()
    }

    it('is the same in one device zone and differs between zones that cut days differently', () => {
      const zones = [
        'UTC',
        'America/Los_Angeles',
        'America/Phoenix',
        'America/Denver',
        'Europe/London',
        'Europe/Berlin',
        'Asia/Kolkata',
        'Pacific/Auckland',
        'Australia/Sydney',
      ]
      const keys = zones.map(keyIn)
      expect(new Set(keys).size).toBe(zones.length)
      expect(zones.map(keyIn)).toEqual(keys)
    })

    it('does not ask Intl for the zone’s name, which costs about 12 ms the first time', () => {
      const asked = vi.spyOn(Intl, 'DateTimeFormat')
      try {
        dayZoneKey()
        expect(asked).not.toHaveBeenCalled()
      } finally {
        asked.mockRestore()
      }
    })
  })
})

describe('thresholdAt', () => {
  const FIT = { cp: 5 } as unknown as NonNullable<ThresholdStep['fit']>
  const step = (fromMs: number, fit: ThresholdStep['fit']): ThresholdStep => ({
    fromMs,
    fit,
    asOfMs: null,
    lastFit: fit === null ? -1 : 0,
  })
  // Sunday 8 March 2026, 18:00 at UTC-7 is Monday 9 March 01:00 UTC; the steps start at week ends.
  const sunday = at(2026, 3, 9) - 1
  const steps = [step(sunday - 7 * DAY_MS, null), step(sunday, FIT)]

  it('reads the week an instant is in in the viewer’s zone, not the UTC week', () => {
    const evening = at(2026, 3, 9, 1)
    // In UTC weeks that Monday 01:00 is the week after, which the second step already holds.
    expect(thresholdAt([step(sunday + 7 * DAY_MS, FIT)], evening)?.fit).toBe(FIT)
    withLocalWeeks(true, () => {
      const before = setViewerZone(fixed(-7))
      try {
        // Sunday evening is Sunday's week: the step that starts at that Sunday's end holds.
        expect(thresholdAt(steps, evening)?.fit).toBe(FIT)
        // Monday morning there is the next week, which no step covers yet, so the last one holds.
        expect(thresholdAt(steps, at(2026, 3, 9, 15))?.fit).toBe(FIT)
        expect(thresholdAt([step(sunday + 7 * DAY_MS, FIT)], evening)).toBeNull()
      } finally {
        setViewerZone(before)
      }
    })
  })
})

describe('the day shift an activity carries', () => {
  // 1 January 2027 at 01:00 UTC was still 31 December 2026 where the file was recorded.
  const newYear = { startMs: at(2027, 1, 1, 1), localDayShift: -1 as const }

  it('sets the age by the year of its local day', () => {
    withLocalWeeks(true, () => {
      expect(ageAt(1990, newYear)).toBe(36)
      expect(ageAt(1990, { startMs: newYear.startMs, localDayShift: 0 })).toBe(37)
      expect(ageAt(1990, newYear.startMs)).toBe(37)
    })
  })

  it('sets the week a threshold is read in', () => {
    const FIT = { cp: 5 } as unknown as NonNullable<ThresholdStep['fit']>
    const sunday = at(2026, 3, 9) - 1
    const steps: ThresholdStep[] = [
      { fromMs: sunday + 7 * DAY_MS, fit: FIT, asOfMs: null, lastFit: 0 },
    ]
    const evening = { startMs: at(2026, 3, 9, 1), localDayShift: -1 as const }
    withLocalWeeks(true, () => {
      expect(thresholdAt(steps, evening)).toBeNull()
      expect(thresholdAt(steps, { startMs: evening.startMs, localDayShift: 0 })?.fit).toBe(FIT)
    })
  })
})

describe('noonOnLabelDate', () => {
  it('is noon on the date a week end reads, in the zone days are cut in', () => {
    const sundayEnd = at(2026, 3, 16) - 1
    withLocalWeeks(true, () => {
      const before = setViewerZone(fixed(-7))
      try {
        expect(noonOnLabelDate(sundayEnd)).toBe(at(2026, 3, 15, 19))
      } finally {
        setViewerZone(before)
      }
    })
  })
})

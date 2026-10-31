import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDayNumber, setViewerZone, UTC_ZONE, weekEndFor } from '@rca/core/calendar'
import { deviceZone, installDeviceZone } from './viewerZone'

afterEach(() => {
  vi.unstubAllEnvs()
  setViewerZone(UTC_ZONE)
})

/** Runs with the process's time zone set, which `Date` follows. */
function inZone<T>(zone: string, run: () => T): T {
  vi.stubEnv('TZ', zone)
  return run()
}

const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min)

describe('deviceZone', () => {
  it('is minutes east of UTC at the instant asked, summer and winter', () => {
    inZone('America/Los_Angeles', () => {
      expect(deviceZone(at(2026, 1, 15, 12))).toBe(-480)
      expect(deviceZone(at(2026, 7, 15, 12))).toBe(-420)
    })
    inZone('Asia/Kolkata', () => expect(deviceZone(at(2026, 1, 15, 12))).toBe(330))
    inZone('Pacific/Auckland', () => {
      expect(deviceZone(at(2026, 1, 15, 12))).toBe(780)
      expect(deviceZone(at(2026, 7, 15, 12))).toBe(720)
    })
  })

  it('changes at the daylight saving instant, in both directions', () => {
    inZone('America/Los_Angeles', () => {
      // O8: the spring-forward day, 8 March 2026, at 02:00 local (10:00 UTC).
      expect(deviceZone(at(2026, 3, 8, 9, 59))).toBe(-480)
      expect(deviceZone(at(2026, 3, 8, 10))).toBe(-420)
      // The fall-back day, 1 November 2026, at 02:00 local PDT (09:00 UTC).
      expect(deviceZone(at(2026, 11, 1, 8, 59))).toBe(-420)
      expect(deviceZone(at(2026, 11, 1, 9))).toBe(-480)
    })
  })
})

describe('the device zone in the calendar', () => {
  it('puts a start that crosses local midnight on the local day, across a daylight saving change', () => {
    inZone('America/Los_Angeles', () => {
      installDeviceZone()
      const day = (ms: number) => localDayNumber({ startMs: ms }) - Math.floor(ms / 86_400_000)
      // 23:30 on Saturday 7 March is 07:30 UTC the next day (PST): the local day is the earlier.
      expect(day(at(2026, 3, 8, 7, 30))).toBe(-1)
      // 23:30 on Sunday 8 March is 06:30 UTC on Monday (PDT, an hour less west): still the earlier day.
      expect(day(at(2026, 3, 9, 6, 30))).toBe(-1)
      // 00:30 on Monday 9 March PDT is 07:30 UTC: the same day as the UTC one.
      expect(day(at(2026, 3, 9, 7, 30))).toBe(0)
    })
  })

  it('cuts a Sunday evening and a Monday morning into their own local weeks', () => {
    inZone('America/Los_Angeles', () => {
      installDeviceZone()
      {
        const sundayEnd = at(2026, 3, 9) - 1
        // Sunday 8 March, 18:00 PDT is Monday 01:00 UTC: Sunday's week.
        expect(weekEndFor({ startMs: at(2026, 3, 9, 1) })).toBe(sundayEnd)
        // Monday 9 March, 00:30 PDT is 07:30 UTC: the next week.
        expect(weekEndFor({ startMs: at(2026, 3, 9, 7, 30) })).toBe(sundayEnd + 7 * 86_400_000)
      }
    })
    inZone('Pacific/Auckland', () => {
      installDeviceZone()
      {
        // Monday 16 March, 00:30 NZDT is Sunday 15 March, 11:30 UTC: Monday's week.
        expect(weekEndFor({ startMs: at(2026, 3, 15, 11, 30) })).toBe(at(2026, 3, 23) - 1)
      }
    })
  })

  it('is installed for the page, so what the page cuts matches the worker', () => {
    inZone('Pacific/Auckland', () => {
      const start = at(2026, 3, 14, 20)
      const before = localDayNumber({ startMs: start })
      installDeviceZone()
      expect(localDayNumber({ startMs: start })).toBe(before + 1)
    })
  })
})

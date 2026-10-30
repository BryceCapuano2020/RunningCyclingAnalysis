import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { weekEndMs } from '../digest/trendPoints'
import type { AthleteSettings } from '../types'
import { periodTimeInZones } from './periodTime'
import type { ZoneEstimates } from './zones'
import { noon, zoneDigest } from './test/zoneDigests'

const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

describe('review 205: week-shared zone lookup', () => {
  it('a stale threshold that lapses mid-week is judged per activity, as a cold lookup does', () => {
    const monday = noon(2026, 3, 2)
    const saturday = noon(2026, 3, 7)
    const asOf = monday + 2 * DAY_MS - 365 * DAY_MS // Monday is 363 days after, Saturday 368
    const fit = { cp: 12, wPrime: 1 } as never
    const estimates: ZoneEstimates = {
      runMaxHeartRate: null,
      rideMaxHeartRate: null,
      runObservedMaxHeartRate: null,
      rideObservedMaxHeartRate: null,
      observedMaxSource: { run: null, ride: null },
      thresholds: {
        run: [
          { fromMs: 0, fit, asOfMs: asOf, lastFit: 0 },
          { fromMs: weekEndMs(monday), fit: null, asOfMs: null, lastFit: 0 },
        ],
        ride: [],
      },
    }
    const mon = zoneDigest({ id: 'm', sport: 'run', startMs: monday, speed: [60, 600] })
    const sat = zoneDigest({ id: 's', sport: 'run', startMs: saturday, speed: [60, 600] })
    const pace = (t: ReturnType<typeof periodTimeInZones>) =>
      t.run.find((r) => r.measure === 'pace')!
    expect(pace(periodTimeInZones([mon], settings, estimates)).counted).toBe(1)
    expect(pace(periodTimeInZones([sat], settings, estimates)).counted).toBe(0)
    const both = pace(periodTimeInZones([mon, sat], settings, estimates))
    expect([both.counted, both.noZones]).toEqual([1, 1])
  })
})

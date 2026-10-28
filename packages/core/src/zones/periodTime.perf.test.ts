import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { fastestMs } from '../test/timing'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { periodTimeInZones } from './periodTime'
import { ZoneTimeCache } from './timeCache'
import type { ZoneEstimates } from './zones'

/**
 * A library of 2,000 activities (about four years of daily training) is cut by the zones in effect on
 * each one's date in about 12 ms locally. The budget is four times that, so a lookup of zones for each
 * activity instead of each day, or a pass over every bin for every zone, fails it. A second ask with the
 * same inputs must not work again.
 */
const BUDGET_MS = 50
const ACTIVITIES = 2000
const DAY_MS = 24 * 3600_000

const estimates: ZoneEstimates = {
  runCp: null,
  rideCp: null,
  runMaxHeartRate: 188,
  rideMaxHeartRate: 184,
  runObservedMaxHeartRate: 188,
  rideObservedMaxHeartRate: 184,
}
const settings: AthleteSettings = {
  massKg: 72,
  bikeMassKg: 9,
  measurements: [
    ...['2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01'].flatMap(
      (from, i): Measurement[] => [
        { kind: 'maxHeartRate', sport: 'run', value: 186 + i, from },
        { kind: 'thresholdPower', sport: 'ride', value: 240 + 5 * i, from },
        { kind: 'thresholdPace', sport: 'run', value: 3.6 + 0.05 * i, from },
        { kind: 'massKg', value: 74 - i, from },
      ],
    ),
  ],
}

function library(): ActivityDigest[] {
  const base = (sport: Sport) => digestActivity(syntheticActivity({ n: 60, sport }))
  const [run, ride] = [base('run'), base('ride')]
  const start = Date.UTC(2022, 0, 1, 7)
  return Array.from({ length: ACTIVITIES }, (_, i) => {
    const sport: Sport = i % 3 === 0 ? 'ride' : 'run'
    const bins = (offset: number, length: number) => ({
      offset,
      counts: Array.from({ length }, (_, k) => 1 + ((i + k) % 17)),
    })
    return {
      ...(sport === 'ride' ? ride : run),
      id: `a${i}`,
      startMs: start + Math.floor(i * 0.7) * DAY_MS,
      distributions:
        sport === 'ride'
          ? { heartRate: bins(90, 80), power: bins(20, 90) }
          : { heartRate: bins(100, 80), speed: bins(40, 100) },
    }
  })
}

describe('time in zones performance', () => {
  const digests = library()

  it(`cuts ${ACTIVITIES} activities by their own dated zones in under ${BUDGET_MS} ms`, () => {
    let counted = 0
    const ms = fastestMs(() => {
      const times = periodTimeInZones(digests, settings, estimates)
      counted = times.run[0]!.counted + times.ride[0]!.counted
    })
    expect(counted).toBe(ACTIVITIES)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it('does not work it out again for the same inputs', () => {
    const cache = new ZoneTimeCache()
    const first = cache.get(digests, [], settings, null)
    let again: unknown
    const ms = fastestMs(() => {
      again = cache.get(digests, [], { ...settings }, null)
    })
    expect(again).toBe(first)
    // Comparing 2,000 digests by identity is the whole cost.
    expect(ms).toBeLessThan(5)
  })
})

import { describe, expect, it } from 'vitest'
import type { AthleteSettings } from '../types'
import { periodTimeInZones } from './periodTime'
import { estimatesOf } from './test/estimates'
import { noon, zoneDigest } from './test/zoneDigests'
import type { ZoneEstimates } from './zones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const FIGURES = {
  runCp: null,
  rideCp: null,
  runMaxHeartRate: 190,
  rideMaxHeartRate: null,
  runObservedMaxHeartRate: 190,
  rideObservedMaxHeartRate: null,
}

const digests = [
  zoneDigest({
    id: 'a',
    sport: 'run',
    startMs: noon(2026, 3, 2),
    heartRate: [150, 1800],
    speed: [60, 1800],
  }),
  zoneDigest({
    id: 'b',
    sport: 'run',
    startMs: noon(2026, 3, 9),
    heartRate: [150, 1800],
    speed: [60, 1800],
  }),
]
const row = (estimates: ZoneEstimates, measure: 'heartRate' | 'pace') =>
  periodTimeInZones(digests, SETTINGS, estimates).run.find((each) => each.measure === measure)!

describe('where a period’s zones were cut from', () => {
  it('marks heart-rate zones cut from the highest heart rate on file, and leaves the mark out otherwise', () => {
    const trusted = row(estimatesOf(FIGURES), 'heartRate')
    expect([trusted.counted, trusted.noZones]).toEqual([2, 0])
    expect('fromHighest' in trusted).toBe(false)
    const highest = row({ ...estimatesOf(FIGURES), untrustedMax: { run: 'low' } }, 'heartRate')
    expect([highest.counted, highest.noZones, highest.fromHighest]).toEqual([2, 0, true])
    expect(highest.seconds).toEqual(trusted.seconds)
  })

  it('counts pace cut from the floor, with the best it is from and the day it was set', () => {
    const asOfMs = noon(2025, 9, 20)
    const bare = estimatesOf(FIGURES)
    const without = row(bare, 'pace')
    expect([without.counted, without.noZones, 'floor' in without]).toEqual([0, 2, false])
    const floored = row(
      { ...bare, floor: { run: { durationS: 1800, value: 15, asOfMs }, ride: null } },
      'pace',
    )
    expect([floored.counted, floored.noZones]).toEqual([2, 0])
    expect(floored.floor).toEqual({ durationS: 1800, asOfMs, activities: 2 })
    expect(floored.totalSeconds).toBe(3600)
  })
})

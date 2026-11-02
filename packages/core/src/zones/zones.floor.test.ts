import { describe, expect, it } from 'vitest'
import type { AthleteSettings } from '../types'
import { missingThresholdZones } from './missingZones'
import { estimatesOf } from './test/estimates'
import { noon } from './test/zoneDigests'
import { zonesAt } from './zones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const FIGURES = {
  runCp: null,
  rideCp: null,
  runMaxHeartRate: 190,
  rideMaxHeartRate: null,
  runObservedMaxHeartRate: 190,
  rideObservedMaxHeartRate: null,
}

/** An old best that is far better than the newer one, and the newer one. */
const OLD = [noon(2019, 3, 1), 20, 0] as const
const NEWER = [noon(2021, 6, 1), 14, 0] as const
const estimates = {
  ...estimatesOf(FIGURES),
  // The library holds runs but no threshold fit stands on any date.
  thresholds: { run: [{ fromMs: 0, fit: null, asOfMs: null, lastFit: -1 }], ride: [] },
  floor: { run: [OLD, NEWER], ride: [] },
  nowMs: noon(2024, 1, 5),
}

const pace = (ms: number) =>
  zonesAt(ms, SETTINGS, estimates).find((set) => set.sport === 'run' && set.measure === 'pace')

describe('a floor is a best up to the activity and within 12 months of it', () => {
  it('cuts an old activity from the best of its own year, not from a later one', () => {
    const set = pace(noon(2019, 6, 10))!
    expect(set).toMatchObject({ floorS: 1800, asOfMs: OLD[0] })
    expect(pace(noon(2021, 8, 1))!.asOfMs).toBe(NEWER[0])
    expect(pace(noon(2021, 8, 1))!.reference).toBeLessThan(set.reference)
  })

  it('has no zones for a past date with no best in the year before it', () => {
    expect(pace(noon(2020, 6, 1))).toBeUndefined()
    expect(pace(noon(2023, 1, 10))).toBeUndefined()
    expect(missingThresholdZones(noon(2020, 6, 1), SETTINGS, estimates)).toEqual([
      { sport: 'run', measure: 'pace', outgrown: false },
    ])
  })

  it('cuts the current zones from the newest best, not from an old and better one, and dates it', () => {
    const today = pace(noon(2024, 1, 10))!
    expect(today).toMatchObject({ floorS: 1800, asOfMs: NEWER[0] })
    // The 2019 best is twenty-seven months older than the newest, outside the year ending with it.
    expect(today.reference).toBe(pace(noon(2021, 8, 1))!.reference)
    expect(missingThresholdZones(noon(2024, 1, 10), SETTINGS, estimates)).toEqual([])
  })

  it('leaves a date before every best without zones, however current the page', () => {
    expect(pace(noon(2018, 6, 1))).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings, DigestCurvePoint } from '../types'
import { MODEL_REVISION } from './modelRevision'
import { combine } from './combine'
import { digestActivity } from './digestActivity'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const { activities } = sampleDataset()
const RIDE_BASE = digestActivity(activities.find((a) => a.sport === 'ride')!)

/** A best at one duration: its value in watts, and the window it came from in the ride. */
type Best = [value: number, startIndex: number, windowS: number]

/**
 * A synthetic ride with the given bests, keyed by duration. Every other duration is empty. Power is
 * measured, so each value is read as watts.
 */
function rideWith(id: string, bests: Record<number, Best>): ActivityDigest {
  const curve: DigestCurvePoint[] = DURATIONS_S.map((durationS) => {
    const best = bests[durationS]
    if (best === undefined) {
      return {
        durationS,
        value: NaN,
        startIndex: -1,
        windowS: durationS,
        heartRate: null,
        terms: null,
      }
    }
    const [value, startIndex, windowS] = best
    return { durationS, value, startIndex, windowS, heartRate: null, terms: null }
  })
  return {
    ...RIDE_BASE,
    id,
    name: id,
    sport: 'ride',
    modelRevision: MODEL_REVISION,
    curve,
    hrBlocks: [],
    calibration: null,
    climbSections: [],
    powerSource: 'measured',
    maxHeartRate: null,
    hasHeartRate: false,
  }
}

/**
 * A ride with 10 minutes of easy riding at about 204 W, then a 10 minute climb at 322 W. Its 15 and
 * 20 minute bests each hold the climb, and its shorter bests of 4 to 10 minutes are the climb.
 */
const CLIMB = rideWith('climb', {
  180: [360, 0, 180],
  240: [346, 600, 240],
  300: [339, 600, 300],
  420: [326, 600, 420],
  600: [322, 600, 600],
  900: [300, 300, 900],
  1200: [290, 0, 1200],
})

/** An evenly paced ride at cp 250 W and W' 20 kJ, so its best at d is 250 + 20000 / d. */
const STEADY = rideWith(
  'steady',
  Object.fromEntries(
    [180, 300, 600, 900, 1200].map((d) => [d, [250 + 20000 / d, 0, d] as Best]),
  ) as Record<number, Best>,
)

describe('uneven bests in the combined analysis', () => {
  it('leaves the 15 and 20 minute bests of a climbing ride out of a second threshold', () => {
    const result = combine([CLIMB], SETTINGS)
    expect(result.rideCp).not.toBeNull()
    expect(result.rideCpUneven).not.toBeNull()
    expect(result.rideCpUneven!.leftOutS).toEqual([900, 1200])
    expect(result.rideCpUneven!.fit.cp).toBeGreaterThan(result.rideCp!.cp)
  })

  it('leaves the main threshold as it was, whatever the uneven one says', () => {
    const result = combine([CLIMB], SETTINGS)
    expect(result.rideCp!.cp).toBeLessThan(263)
    expect(result.rideCpRefusal).toBeNull()
  })

  it('has no second threshold for an evenly paced ride', () => {
    const result = combine([STEADY], SETTINGS)
    expect(result.rideCp).not.toBeNull()
    expect(result.rideCpUneven).toBeNull()
  })

  it('has no uneven threshold for runs when there are none', () => {
    const result = combine([CLIMB], SETTINGS)
    expect(result.runCpUneven).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { combine } from './combine'
import type { CombineOptions } from './combine'
import { judgedWorkOf } from './judgedWork'
import { judgeHeartRate } from './setAside'
import { ride, SETTINGS } from './test/estimatedRideFixture'
import type { Window } from './test/estimatedRideFixture'
import type { ActivityDigest } from '../types'

const DURATIONS = [180, 300, 600, 900, 1200, 1800]

/** A ride with a power meter whose windows follow a threshold of 220 W and 15 kJ above it, `scale` times. */
function steady(id: string, day: number, scale: number, heartRate?: number): ActivityDigest {
  const windows: Record<number, Window> = {}
  for (const durationS of DURATIONS) {
    const watts = scale * (220 + 15000 / durationS)
    windows[durationS] = { watts, heartRate: heartRate ?? Math.round(100 + 0.3 * watts) }
  }
  return ride(id, day, 'measured', windows, { maxHeartRate: 190 })
}

const library = [
  ...Array.from({ length: 8 }, (_, i) => steady(`s${i}`, i, 0.9 + 0.04 * i)),
  steady('broken', 7, 1.4, 60),
]

/** What the session gives an analysis of the whole library: the judgement's own answers. */
function givenBy(judgement: ReturnType<typeof judgeHeartRate>): CombineOptions {
  return {
    heartRateSetAside: new Set(judgement.setAside),
    calibration: judgement.calibration,
    references: {
      referenceHr: judgement.referenceHr,
      observedMaxHr: judgement.observedMaxHr,
      effortReference: judgement.effortReference,
    },
    rideGate: judgement.rideGate,
  }
}

describe('an analysis that takes the work of the judgement', () => {
  const judgement = judgeHeartRate(library, SETTINGS)
  const work = judgedWorkOf(judgement)!

  it('is the analysis that works it out again, and does not work it out again', () => {
    expect(judgement.setAside).toEqual(['broken'])
    const alone = combine(library, SETTINGS, givenBy(judgement))
    const taking = combine(library, SETTINGS, { ...givenBy(judgement), judged: work })
    expect(taking).toEqual(alone)
    expect(taking.hr).toEqual(work.cross)
    // What it hands out is its own, so a change to it cannot reach the judgement.
    expect(taking.hr).not.toBe(work.cross)
    expect(taking.bikeModel).not.toBe(work.bikeModel)
    expect(taking.rideMetabolicCurve).not.toBe(work.curves.rideMetabolic)
  })

  it('gives what a fresh analysis gives for other body masses, activities, gates and set-asides', () => {
    const given = givenBy(judgement)
    const heavier = { ...SETTINGS, massKg: SETTINGS.massKg + 5 }
    const cases: [ActivityDigest[], typeof SETTINGS, CombineOptions][] = [
      [library, heavier, given],
      // The year of birth moves the reference the effort gate reads, so the judgement's work is not the answer.
      [library, { ...SETTINGS, birthYear: 1985 }, given],
      [library.slice(1), SETTINGS, given],
      [library, SETTINGS, { ...given, rideGate: null }],
      [library, SETTINGS, { ...given, heartRateSetAside: new Set() }],
      [library, SETTINGS, {}],
    ]
    for (const [digests, settings, options] of cases) {
      expect(combine(digests, settings, { ...options, judged: work })).toEqual(
        combine(digests, settings, options),
      )
    }
  })
})

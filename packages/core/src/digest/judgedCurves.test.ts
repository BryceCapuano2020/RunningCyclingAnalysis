import { describe, expect, it } from 'vitest'
import { HR_SET_ASIDE_MIN_S } from '../constants'
import type { ActivityDigest } from '../types'
import { combine } from './combine'
import { rideGateOf } from './estimatedRide'
import { orderedCurrent } from './ordered'
import { judgeHeartRate } from './setAside'
import { ride, SETTINGS } from './test/estimatedRideFixture'
import type { Window } from './test/estimatedRideFixture'

const DURATIONS = [180, 300, HR_SET_ASIDE_MIN_S, 900, 1200, 1800]

/** A ride whose best windows follow a threshold of 220 W and 15 kJ above it, `scale` times, at the athlete's heart rate. */
function steady(id: string, day: number, scale: number, heartRate?: number): ActivityDigest {
  const windows: Record<number, Window> = {}
  for (const durationS of DURATIONS) {
    const watts = scale * (220 + 15000 / durationS)
    windows[durationS] = { watts, heartRate: heartRate ?? Math.round(100 + 0.3 * watts) }
  }
  return ride(id, day, 'measured', windows, { maxHeartRate: 190 })
}

const good = (count: number) =>
  Array.from({ length: count }, (_, i) => steady(`s${i}`, i, 0.9 + 0.04 * i))
/** A ride held above threshold for 10 min at 60 bpm, which the judgement sets aside. */
const BROKEN = steady('broken', 7, 1.4, 60)
/** A ride without a power meter that is drafted at 10 min: far more watts than any measured one, at an easy heart rate (still under what riders hold, which would set it aside anyway). */
const DRAFTED = ride('drafted', 20, 'virtual', {
  [HR_SET_ASIDE_MIN_S]: { watts: 480, heartRate: 100 },
})

describe('the gate when the judgement sets more heart rate aside than the first pass', () => {
  it('rebuilds once without the ride set aside, as combine does with the judgement given', () => {
    const library = [...good(8), BROKEN]
    const judged = judgeHeartRate(library, SETTINGS)
    expect(judged.setAside).toEqual(['broken'])
    const rebuilt = judged.rideGate!
    expect([...rebuilt.lines]).toEqual([...rideGateOf(orderedCurrent(good(8)), new Set())!.lines])

    // On its own, combine judges and rebuilds the same way; given the judgement it reaches the same curve.
    const alone = combine([...library, DRAFTED], SETTINGS)
    const given = combine([...library, DRAFTED], SETTINGS, {
      heartRateSetAside: new Set(judged.setAside),
      rideGate: rideGateOf(orderedCurrent([...library, DRAFTED]), new Set(judged.setAside)),
    })
    expect(alone.heartRateSetAside).toEqual(['broken'])
    expect(alone.rideCurve).toEqual(given.rideCurve)
    expect(alone.rideCurve.find((p) => p.durationS === HR_SET_ASIDE_MIN_S)!.activityId).not.toBe(
      'drafted',
    )
  })

  it('has no gate once the ride set aside leaves too few, and then every estimate counts as before', () => {
    const library = [...good(5), BROKEN]
    expect(rideGateOf(orderedCurrent(library), new Set())).not.toBeNull()

    const judged = judgeHeartRate(library, SETTINGS)
    expect(judged.setAside).toEqual(['broken'])
    expect(judged.rideGate).toBeNull()

    const result = combine([...library, DRAFTED], SETTINGS)
    expect(result.heartRateSetAside).toEqual(['broken'])
    expect(result.rideCurve.find((p) => p.durationS === HR_SET_ASIDE_MIN_S)!.activityId).toBe(
      'drafted',
    )
  })
})

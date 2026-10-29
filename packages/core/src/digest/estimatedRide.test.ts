import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { mulberry32, normal } from '../math'
import { recordHolders } from '../records'
import { AnalysisSession } from '../session'
import type { ActivityDigest } from '../types'
import { combine } from './combine'
import { ESTIMATED_RIDE, estimatedHolds, ownRideGate, rideGateOf } from './estimatedRide'
import { orderedCurrent } from './ordered'
import { fitnessTrend } from './trend'
import { ride, SETTINGS } from './test/estimatedRideFixture'
import type { Window } from './test/estimatedRideFixture'

/** Heart rate on watts at 5 min and at 1 min in the synthetic athlete, a little different day to day. */
const hr5 = (watts: number, i: number) => Math.round(90 + 0.35 * watts + ((i * 7) % 5) - 2)
const hr1 = (watts: number, i: number) => Math.round(110 + 0.2 * watts + ((i * 3) % 5) - 2)

/** `count` rides with a power meter, their 5 min best 200 W up and their 1 min best 300 W up, at the athlete's heart rate. */
function measuredRides(count: number): ActivityDigest[] {
  return Array.from({ length: count }, (_, i) => {
    const five = 200 + 10 * i
    const one = 300 + 15 * i
    return ride(`measured-${i}`, i, 'measured', {
      60: { watts: one, heartRate: hr1(one, i) },
      300: { watts: five, heartRate: hr5(five, i) },
    })
  })
}

const BEST_5 = 200 + 10 * 13
const BEST_1 = 300 + 15 * 13
const LIBRARY = measuredRides(14)

/** A ride without a power meter with these windows, the day after the library. */
const estimated = (
  id: string,
  windows: Record<number, Window>,
  over: Partial<ActivityDigest> = {},
) => ride(id, 20, 'virtual', windows, over)

/** A drafted descent: watts far above any measured best at 1 min and 5 min, at a heart rate of an easy ride. */
const DRAFTED = estimated('drafted', {
  60: { watts: 900, heartRate: 110 },
  300: { watts: 420, heartRate: 110 },
})

const best = (digests: ActivityDigest[], durationS: number, over = {}) =>
  combine(digests, SETTINGS, over).rideCurve.find((p) => p.durationS === durationS)!

describe('an estimated ride against the measured ones', () => {
  it('does not take a best from measured rides when its heart rate is far under theirs', () => {
    const library = [...LIBRARY, DRAFTED]
    expect(best(library, 300).activityId).toBe('measured-13')
    expect(best(library, 300).value).toBe(BEST_5)
    expect(best(library, 60).activityId).toBe('measured-13')
    expect(best(library, 60).value).toBe(BEST_1)
    // Without the rule the drafted windows win both, which is what it is there to stop.
    expect(best(library, 300, { rideGate: null }).activityId).toBe('drafted')
    expect(best(library, 60, { rideGate: null }).activityId).toBe('drafted')
  })

  it('takes the best when its heart rate matches the measured line', () => {
    const backed = estimated('backed', {
      60: { watts: 900, heartRate: hr1(BEST_1, 0) },
      300: { watts: 420, heartRate: hr5(BEST_5, 0) },
    })
    const library = [...LIBRARY, backed, DRAFTED]
    expect(best(library, 300).activityId).toBe('backed')
    expect(best(library, 300).value).toBeCloseTo(420, 6)
    expect(best(library, 60).activityId).toBe('backed')
  })

  it('counts a window at the heart rate of its watts below the top of the fitted range', () => {
    const inside = estimated('inside', { 300: { watts: 250, heartRate: hr5(250, 0) } })
    expect(best([...LIBRARY, inside], 300).activityId).toBe('measured-13')
    // It is the heart rate of a 250 W window, so it holds, though it is no best.
    const held = estimatedHolds(rideGateOf(orderedCurrent(LIBRARY), new Set()), [...LIBRARY])
    expect(
      held(
        inside,
        inside.curve.find((p) => p.durationS === 300)!,
        250,
      ),
    ).toBe(true)
  })

  it('does not let an estimate with no heart rate outrank a measurement, but lets it stand alone', () => {
    const noHeartRate = estimated(
      'no-hr',
      {
        60: { watts: 900, heartRate: null },
        300: { watts: 420, heartRate: null },
        3600: { watts: 180, heartRate: null },
      },
      { hasHeartRate: false },
    )
    const library = [...LIBRARY, noHeartRate]
    expect(best(library, 300).activityId).toBe('measured-13')
    expect(best(library, 60).activityId).toBe('measured-13')
    // No measured ride has an hour, so the estimate stands: it is all there is.
    expect(best(library, 3600).activityId).toBe('no-hr')
    expect(best(library, 3600).value).toBeCloseTo(180, 6)
  })

  it('reads heart rate that is set aside as no heart rate', () => {
    const backed = estimated('backed', { 300: { watts: 420, heartRate: hr5(BEST_5, 0) } })
    const library = [...LIBRARY, backed]
    expect(best(library, 300).activityId).toBe('backed')
    expect(best(library, 300, { heartRateSetAside: new Set(['backed']) }).activityId).toBe(
      'measured-13',
    )
  })

  it('fits only measured rides whose heart rate is trusted', () => {
    const gate = rideGateOf(orderedCurrent(LIBRARY), new Set())
    expect(gate).not.toBeNull()
    const line = gate!.lines.get(300)!
    expect(line.slope).toBeGreaterThan(0)
    expect(line.from).toBe(200)
    expect(line.to).toBe(BEST_5)
    // Rides set aside are not fitted: down to minActivities left there is a gate, one fewer and there is none.
    const names = LIBRARY.map((d) => d.id)
    const spare = LIBRARY.length - ESTIMATED_RIDE.minActivities
    expect(rideGateOf(orderedCurrent(LIBRARY), new Set(names.slice(0, spare)))).not.toBeNull()
    expect(rideGateOf(orderedCurrent(LIBRARY), new Set(names.slice(0, spare + 1)))).toBeNull()
  })

  it('is as it was with too few measured rides to fit', () => {
    const few = [...measuredRides(ESTIMATED_RIDE.minActivities - 1), DRAFTED]
    expect(ownRideGate(orderedCurrent(few))).toBeNull()
    expect(best(few, 300).activityId).toBe('drafted')
    expect(combine(few, SETTINGS)).toEqual(combine(few, SETTINGS, { rideGate: null }))
  })

  it('reads a period by the library, even when the period has few measured rides of its own', () => {
    const library = [...LIBRARY, DRAFTED]
    const gate = rideGateOf(orderedCurrent(library), new Set())
    const period = [...LIBRARY.slice(0, 3), DRAFTED]
    expect(best(period, 300).activityId).toBe('drafted')
    expect(best(period, 300, { rideGate: gate }).activityId).toBe('measured-2')
  })
})

describe('where the rule is read', () => {
  const library = [...LIBRARY, DRAFTED]
  const gate = rideGateOf(orderedCurrent(library), new Set())

  it('gives the record to the measured ride, as the curve does', () => {
    const held = (digests: ActivityDigest[], id: string) =>
      recordHolders(digests, SETTINGS, gate).get(id) ?? []
    expect(held(library, 'drafted')).toEqual([])
    expect(held(library, 'measured-13')).toContainEqual({ kind: 'duration', durationS: 300 })
    expect(recordHolders(library, SETTINGS, null).get('drafted')).toContainEqual({
      kind: 'duration',
      durationS: 300,
    })
  })

  it('gives the trend the measured ride', () => {
    const rideWatts = (rideGate: typeof gate) => {
      const points = fitnessTrend(library, SETTINGS, { durationS: 300, rideGate })
      return points.at(-1)!.rideAtMs
    }
    expect(rideWatts(gate)).toBe(LIBRARY[13]!.startMs)
    expect(rideWatts(null)).toBe(DRAFTED.startMs)
  })

  it('agrees across the session: curve, record and judgement are one rule', () => {
    const state = new AnalysisSession().loadDigests(library, SETTINGS)
    expect(state.heartRateJudgement.rideGate).not.toBeNull()
    expect(state.result!.rideCurve.find((p) => p.durationS === 300)!.activityId).toBe('measured-13')
    expect(state.records.get('drafted')).toBeUndefined()
    expect(state.records.get('measured-13')).toContainEqual({ kind: 'duration', durationS: 300 })
  })
})

describe('the share of the measured heart rate an estimated window must show', () => {
  /** 40 measured rides at the athlete's line, `spread` bpm of day-to-day spread, and the gate they give. */
  function athlete(spread: number, random: () => number) {
    const watts = () => Math.min(380, Math.max(150, 250 + 40 * normal(random)))
    const rides = Array.from({ length: 40 }, (_, i) => {
      const w = watts()
      return ride(`m${i}`, i, 'measured', {
        300: { watts: w, heartRate: 95 + 0.36 * w + spread * normal(random) },
      })
    })
    const ordered = orderedCurrent(rides)
    return { watts, ordered, holds: estimatedHolds(rideGateOf(ordered, new Set()), ordered) }
  }

  it('keeps nearly all honest windows, and drops the overstated and the easy-heart-rate ones', () => {
    const random = mulberry32(11)
    const { watts, holds } = athlete(6, random)
    const point = (digest: ActivityDigest) => digest.curve.find((p) => p.durationS === 300)!
    const kept = { honest: 0, exact: 0, overstated: 0, easy: 0 }
    const draws = 1500
    for (let i = 0; i < draws; i++) {
      const w = watts()
      const line = 95 + 0.36 * w
      // Every window below is of a ride without a power meter whose true watts are w.
      const window = (heartRate: number) =>
        ride('x', 0, 'virtual', { 300: { watts: w, heartRate } })
      const heartRate = line + 6 * normal(random)
      const honest = window(heartRate)
      // An honest estimate has a 12% error; an exact one has none, and so is the case of a measured window.
      if (holds(honest, point(honest), w * (1 + 0.12 * normal(random)))) kept.honest++
      if (holds(honest, point(honest), w)) kept.exact++
      // A drafted window is priced 30% over its watts and shows the heart rate of the watts it was.
      if (holds(honest, point(honest), w * 1.3)) kept.overstated++
      const easy = window(0.7 * line)
      if (holds(easy, point(easy), w)) kept.easy++
    }
    expect(kept.exact / draws).toBeGreaterThan(0.97)
    expect(kept.honest / draws).toBeGreaterThan(0.93)
    expect(kept.overstated / draws).toBeLessThan(0.5)
    expect(kept.easy / draws).toBeLessThan(0.05)
  })

  it('has a line for every duration the measured rides have enough windows for, and no other', () => {
    const gate = rideGateOf(orderedCurrent(LIBRARY), new Set())!
    expect([...gate.lines.keys()].sort((a, b) => a - b)).toEqual([60, 300])
    expect(DURATIONS_S).toContain(60)
  })
})

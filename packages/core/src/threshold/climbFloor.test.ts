import { describe, expect, it } from 'vitest'
import { CLIMB_BPM, CLIMB_FADE_BPM, GAP_PRIOR } from './constants'
import { rideThreshold } from './estimate'
import { fuse } from './fusion'
import { climbWeight } from './heartRateLine'
import { allOutRide, ride, steadyRide, type Library, type Rider } from './test/rides'

/*
 * Near the flat floor (a climb of 20 bpm from half to full threshold power) a line has the most watts per beat, so sliding an
 * effort to threshold heart rate is least sure there. The floor used to be a cliff: just under it heart rate counted for nothing,
 * just over it in full, and one ride that nudged the climb across it could lift the answer by the most heart rate may claim.
 */

const THRESHOLD = 250
/** The threshold heart rate passed: 11 bpm over where these riders' heart rate sits at threshold, a reference maximum set high. */
const PASSED_HR = 171

/** Ten rides that give everything or nearly: their bests say the threshold is about 250. Their lines differ a little in slope. */
function library(): Library[] {
  return Array.from({ length: 10 }, (_, i) => {
    const rider: Rider = {
      threshold: THRESHOLD,
      slope: 0.16 + 0.015 * ((i % 5) - 2),
      thresholdHr: 160,
    }
    const make = i % 2 === 0 ? allOutRide : steadyRide
    return ride(rider, make(rider, `r${i}`, { ageDays: 3 + i }))
  })
}

/** One more steady ride whose heart rate climbs steeply with power: enough to tip the pooled climb just past 20 bpm. */
function tippingRide(): Library {
  const rider: Rider = { threshold: THRESHOLD, slope: 0.4, thresholdHr: 160 }
  return ride(rider, steadyRide(rider, 'new', { ageDays: 0 }))
}

const answer = (parts: Library[]) =>
  rideThreshold(
    parts.flatMap((p) => p.efforts),
    parts.flatMap((p) => p.blocks),
    PASSED_HR,
  )!

describe('heart rate near the flat floor', () => {
  it('does not let one ride that tips the climb past the floor lift the answer', () => {
    const without = answer(library())
    const withRide = answer([...library(), tippingRide()])
    // Without the ride the line is flat and refused; with it heart rate reads far over the bests.
    expect(without.heartRate).toEqual({ refused: 'flat' })
    expect('value' in withRide.heartRate && withRide.heartRate.value).toBeGreaterThan(
      1.2 * withRide.efforts.value,
    )
    expect(withRide.value / without.value).toBeLessThan(1.02)
    expect(withRide.value / withRide.efforts.value).toBeLessThan(1.02)
  })

  it('weighs heart rate from nothing at the floor to all of it a few bpm above', () => {
    const at = (climb: number) => climbWeight(climb / (0.5 * THRESHOLD), THRESHOLD)
    expect(at(CLIMB_BPM[0] - 1)).toBe(0)
    expect(at(CLIMB_BPM[0])).toBe(0)
    expect(at(CLIMB_BPM[0] + CLIMB_FADE_BPM / 2)).toBeCloseTo(0.5, 6)
    expect(at(CLIMB_BPM[0] + CLIMB_FADE_BPM)).toBe(1)
    expect(at(40)).toBe(1)
    expect(climbWeight(Number.NaN, THRESHOLD)).toBe(0)
  })

  it('moves the answer smoothly as the climb crosses the floor', () => {
    // Heart rate 15% over the bests, a lift the prior allows: the answer may rise to it, but by no step on the way.
    let last = fuse(THRESHOLD, 0.025, null).value
    for (let climb = CLIMB_BPM[0] - 1; climb <= CLIMB_BPM[0] + CLIMB_FADE_BPM + 1; climb += 0.1) {
      const weight = climbWeight(climb / (0.5 * THRESHOLD), THRESHOLD)
      const { value } = fuse(THRESHOLD, 0.025, {
        value: 1.15 * THRESHOLD,
        relativeError: 0.04,
        weight,
      })
      expect(Math.abs(value - last) / THRESHOLD, `${climb.toFixed(1)} bpm`).toBeLessThan(0.01)
      last = value
    }
    expect(last / THRESHOLD).toBeGreaterThan(1.1)
  })

  it('answers what power alone does where heart rate has no weight', () => {
    const heartRate = { value: 1.15 * THRESHOLD, relativeError: 0.04, weight: 0 }
    expect(fuse(THRESHOLD, 0.025, heartRate)).toEqual(fuse(THRESHOLD, 0.025, null))
  })
})

describe('heart rate past what the bests allow', () => {
  it('loses its weight rather than holding the answer at the most the prior allows', () => {
    const read = (share: number) =>
      fuse(THRESHOLD, 0.025, { value: share * THRESHOLD, relativeError: 0.04 }).value / THRESHOLD
    // Inside the prior's reach heart rate lifts the answer most of the way.
    expect(read(1.15)).toBeGreaterThan(1.1)
    // Far past it, it no longer pins the answer at 1 + largeMax.
    expect(read(1.4)).toBeLessThan(1 + GAP_PRIOR.largeMax / 2)
    expect(read(1.6)).toBeLessThan(1.02)
    expect(read(1.6)).toBeGreaterThanOrEqual(1)
  })
})

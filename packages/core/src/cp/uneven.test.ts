import { describe, expect, it } from 'vitest'
import type { Curve } from '../types'
import { criticalPowerOutcome } from './criticalPower'
import { unevenDurations, unevenFit } from './uneven'

/** A best effort: its value, and the window it came from in its own activity. */
interface Best {
  durationS: number
  value: number
  activityId: string
  startIndex: number
  windowS: number
}

/** A curve of the given bests, each carrying the window it came from. */
function fixture(bests: Best[]): Curve {
  return bests.map(({ durationS, value, activityId, startIndex, windowS }) => ({
    durationS,
    value,
    activityId,
    startIndex,
    windowS,
  }))
}

/**
 * A ride with 10 minutes of easy riding at about 204 W, then a 10 minute climb at 322 W. Its shorter
 * bests are the hard starts of the climb, and its 15 and 20 minute bests each hold the climb.
 */
const CLIMB: Best[] = [
  { durationS: 180, value: 360, activityId: 'climb', startIndex: 0, windowS: 180 },
  { durationS: 240, value: 346, activityId: 'climb', startIndex: 600, windowS: 240 },
  { durationS: 300, value: 339, activityId: 'climb', startIndex: 600, windowS: 300 },
  { durationS: 420, value: 326, activityId: 'climb', startIndex: 600, windowS: 420 },
  { durationS: 600, value: 322, activityId: 'climb', startIndex: 600, windowS: 600 },
  { durationS: 900, value: 300, activityId: 'climb', startIndex: 300, windowS: 900 },
  { durationS: 1200, value: 290, activityId: 'climb', startIndex: 0, windowS: 1200 },
]

/** An evenly paced ride: every window at 280 W, so a nested best is no harder than the window around it. */
const EVEN: Best[] = [180, 300, 600, 900, 1200].map((durationS) => ({
  durationS,
  value: 280,
  activityId: 'even',
  startIndex: 0,
  windowS: durationS,
}))

/** Bests from separate rides, a cp 250 W and W' 20 kJ model, so no best has a shorter one inside it. */
const STEADY: Best[] = [180, 300, 600, 900, 1200].map((durationS) => ({
  durationS,
  value: 250 + 20000 / durationS,
  activityId: `ride-${durationS}`,
  startIndex: 0,
  windowS: durationS,
}))

describe('unevenDurations', () => {
  it('flags the 15 and 20 minute bests of a ride that held a shorter hard effort with easy riding around it', () => {
    expect(unevenDurations(fixture(CLIMB))).toEqual([900, 1200])
  })

  it('does not flag an evenly paced long best, since its rest is as hard as its shorter best', () => {
    expect(unevenDurations(fixture(EVEN))).toEqual([])
  })

  it('does not flag a long best whose shorter bests come from other rides', () => {
    expect(unevenDurations(fixture(STEADY))).toEqual([])
  })

  it('needs the shorter best to come from the same activity', () => {
    // The 10 minute best is from another ride, and the nested 7 minute best is too short to count.
    const bests: Best[] = [
      { durationS: 600, value: 322, activityId: 'other', startIndex: 600, windowS: 600 },
      { durationS: 420, value: 326, activityId: 'climb', startIndex: 600, windowS: 420 },
      { durationS: 1200, value: 263, activityId: 'climb', startIndex: 0, windowS: 1200 },
    ]
    expect(unevenDurations(fixture(bests))).toEqual([])
  })

  it('needs the shorter best to be at least 40% as long as the long one', () => {
    // A 4 minute best inside a 20 minute window is a fifth of it, so it does not count.
    const bests: Best[] = [
      { durationS: 240, value: 322, activityId: 'climb', startIndex: 600, windowS: 240 },
      { durationS: 1200, value: 263, activityId: 'climb', startIndex: 0, windowS: 1200 },
    ]
    expect(unevenDurations(fixture(bests))).toEqual([])
  })

  it('needs the rest of the window to be below 85% of the shorter best', () => {
    // A 20 minute best of 285 W around a 10 minute best of 300 W leaves a rest of 270 W, which is 90%.
    const even: Best[] = [
      { durationS: 600, value: 300, activityId: 'a', startIndex: 600, windowS: 600 },
      { durationS: 1200, value: 285, activityId: 'a', startIndex: 0, windowS: 1200 },
    ]
    // At 270 W the same best leaves a rest of 240 W, which is 80%.
    const hard: Best[] = even.map((b) => (b.durationS === 1200 ? { ...b, value: 270 } : b))
    expect(unevenDurations(fixture(even))).toEqual([])
    expect(unevenDurations(fixture(hard))).toEqual([1200])
  })

  it('leaves out a best with no window in its digest, since its rest cannot be read', () => {
    const bests = CLIMB.map((b) => (b.durationS === 1200 ? { ...b, startIndex: -1 } : b))
    expect(unevenDurations(fixture(bests))).toEqual([900])
  })

  it('never flags a best shorter than 10 minutes', () => {
    const bests: Best[] = [
      { durationS: 180, value: 360, activityId: 'a', startIndex: 0, windowS: 180 },
      { durationS: 420, value: 300, activityId: 'a', startIndex: 0, windowS: 420 },
    ]
    expect(unevenDurations(fixture(bests))).toEqual([])
  })
})

describe('unevenFit', () => {
  it('is still fitted when the main fit is refused, since the floor the bests set is a fact either way', () => {
    // With a 20 minute best of 263 W the main fit is about 269 W, above that best, so it is refused.
    const low = CLIMB.map((b) => (b.durationS === 1200 ? { ...b, value: 263 } : b))
    const curve = fixture(low)
    expect(criticalPowerOutcome(curve).fit).toBeNull()
    const uneven = unevenFit(curve, 0, null)
    expect(uneven?.leftOutS).toEqual([900, 1200])
    // The floor is the lowest left-out best, the 20 minute 263 W, which the threshold sits below.
    expect(uneven?.floor).toBe(263)
  })

  it('is null when no best is uneven', () => {
    const curve = fixture(STEADY)
    expect(criticalPowerOutcome(curve).fit).not.toBeNull()
    expect(unevenFit(curve, 0, criticalPowerOutcome(curve).fit)).toBeNull()
  })

  it('fits the bests that are not uneven, with a threshold above the main fit', () => {
    const curve = fixture(CLIMB)
    const main = criticalPowerOutcome(curve).fit
    const uneven = unevenFit(curve, 0, main)
    expect(main).not.toBeNull()
    expect(uneven).not.toBeNull()
    expect(uneven!.leftOutS).toEqual([900, 1200])
    expect(uneven!.fit.cp).toBeGreaterThan(main!.cp)
    const kept = curve.filter((p) => p.durationS !== 900 && p.durationS !== 1200)
    expect(uneven!.fit.cp).toBeCloseTo(criticalPowerOutcome(kept, { minLongestS: 600 }).fit!.cp, 9)
  })

  it('is null when the bests left in are too few to fit', () => {
    // Without the 15 and 20 minute bests, only the 3 minute and 10 minute bests are left.
    const bests = CLIMB.filter(
      (b) => b.durationS === 180 || b.durationS === 600 || b.durationS >= 900,
    )
    const curve = fixture(bests)
    expect(unevenFit(curve, 0, criticalPowerOutcome(curve).fit)).toBeNull()
  })
})

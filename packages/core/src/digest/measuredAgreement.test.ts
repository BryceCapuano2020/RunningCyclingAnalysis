import { describe, expect, it } from 'vitest'
import { agreedStreams } from '../quality/agreement'
import type { Activity } from '../types'
import { digestActivity } from './digestActivity'
import { syntheticActivity } from './test/syntheticActivity'

const N = 900

/**
 * A steady climb of a ride at 8 m/s whose recorded distance gains only 3.5 m/s from second
 * `disagreeFrom` on, or never when it is Infinity.
 */
function climbingRide(power: boolean, disagreeFrom: number): Activity {
  const base = syntheticActivity({
    id: 'ride',
    sport: 'ride',
    n: N,
    speed: new Float64Array(N).fill(8),
    grade: 0.05,
    power: power ? new Float64Array(N).fill(300) : undefined,
  })
  if (disagreeFrom === Infinity) return base
  const distance = new Float64Array(N)
  for (let i = 1; i < N; i++) distance[i] = distance[i - 1]! + (i >= disagreeFrom ? 3.5 : 8)
  return { ...base, distance }
}

const coveredSeconds = (ride: Activity) => agreedStreams(ride).covered

describe('the digest of a ride with a power meter where the streams disagree', () => {
  it('leaves the covered seconds out of calibration and climb sections, and uses the rest as is', () => {
    const ride = climbingRide(true, 400)
    const first = coveredSeconds(ride).indexOf(1)
    expect(first).toBeGreaterThan(300)
    // The same ride whose streams agree, with its power unknown from the first covered second on.
    const reference = climbingRide(true, Infinity)
    reference.power.fill(NaN, first)
    const expected = digestActivity(reference)
    const digest = digestActivity(ride)
    expect(expected.calibration!.blocks).toBeGreaterThan(5)
    expect(digest.calibration).toEqual(expected.calibration)
    expect(digest.climbSections.length).toBeGreaterThan(0)
    expect(digest.climbSections).toEqual(expected.climbSections)
    for (const section of digest.climbSections) expect(section.end).toBeLessThanOrEqual(first)
    expect(digest.flagCounts['stream-disagreement']).toBe(1)
  })

  it('is untouched when the streams agree', () => {
    const digest = digestActivity(climbingRide(true, Infinity))
    expect(digest.calibration!.blocks).toBe(N / 30)
  })
})

describe('the digest of a ride without a power meter where the streams disagree', () => {
  it('credits the lowered speed, as its power comes from the speed', () => {
    const lowered = digestActivity(climbingRide(false, 0))
    const plain = digestActivity(climbingRide(false, Infinity))
    const aero = (d: typeof lowered) => d.curve.find((p) => p.durationS === 600)?.terms?.aero
    // Over the whole ride the speed reads 8 m/s but the distance supports 3.5: aero goes as v cubed.
    expect(aero(plain)).toBeGreaterThan(0)
    expect(aero(lowered)!).toBeLessThan(0.5 * aero(plain)!)
  })
})

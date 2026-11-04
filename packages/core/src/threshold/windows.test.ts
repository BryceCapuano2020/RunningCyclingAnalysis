import { describe, expect, it } from 'vitest'
import { estimateOver, fitThresholdLine, rideThreshold, thresholdBasis } from './estimate'
import { windowFrame } from './heartRateEstimate'
import { prepareFlat } from './rides'
import { RIDER, library, rides, steadyRide } from './test/rides'
import type { RideSpec } from './test/rides'

/*
 * Many windows of one set of rides read the heart-rate line fitted once over the set. A window keeps its own power estimate
 * (which the climb is asked of), its own pooled offset and its own highest block; the slope, the spread and each ride's offset
 * are the line's.
 */

const THRESHOLD_HR = RIDER.thresholdHr

function setOf(specs: readonly RideSpec[]) {
  const { efforts, blocks } = library(RIDER, specs)
  const { rides: prepared, ages } = prepareFlat(efforts, blocks)
  const line = fitThresholdLine(prepared, ages)
  return {
    efforts,
    blocks,
    prepared,
    ages,
    line,
    basis: thresholdBasis(prepared, line, THRESHOLD_HR),
  }
}

describe('a window of a set read against the line fitted over the set', () => {
  const steady = rides(6, (id, over) => steadyRide(RIDER, id, over), 's')

  it('is, over the whole set, the estimate that fits its own line', () => {
    const { efforts, blocks, basis, ages } = setOf(steady)
    expect(estimateOver(basis, ages)).toEqual(rideThreshold(efforts, blocks, THRESHOLD_HR))
    expect(estimateOver(basis, ages)!.heartRate).toMatchObject({ value: expect.any(Number) })
  })

  it('reads a part of the set without fitting a line of its own', () => {
    const { basis, ages, line } = setOf(steady)
    if ('refused' in line) throw new Error(line.refused)
    // Three rides hold 24 blocks in the band, but the line was fitted over all six: the window's answer has the set's slope.
    const part = estimateOver(basis, ages, 0, 3)!
    expect(part.efforts.rides).toBe(3)
    expect(part.heartRate).toMatchObject({ value: expect.closeTo(RIDER.threshold, 3) })
  })

  it('takes its pooled offset from its own rides and the set’s from all of them', () => {
    // Three rides with a strap reading 4 bpm high, then three reading 4 low: neither group is far enough off to be left out.
    const high = rides(3, (id, over) => steadyRide(RIDER, id, { ...over, offsetBpm: 4 }), 'high')
    const low = rides(3, (id, over) => steadyRide(RIDER, id, { ...over, offsetBpm: -4 }), 'low')
    const { basis, line } = setOf([...high, ...low])
    if ('refused' in basis.heart) throw new Error(basis.heart.refused)
    const own = 60 // heart rate at zero value for a rider on this line: 160 - 0.4 * 250
    expect(line).not.toHaveProperty('refused')
    expect(windowFrame(basis.heart, 3, 6).pooled).toBeCloseTo(own - 4, 6)
    expect(windowFrame(basis.heart, 0, 3).pooled).toBeCloseTo(own + 4, 6)
    // Over all six the median is the upper one of the middle pair.
    expect(windowFrame(basis.heart, 0, 6).pooled).toBeCloseTo(own + 4, 6)
  })

  it('takes its highest block from its own rides', () => {
    const early = rides(3, (id, over) => steadyRide(RIDER, id, { ...over, offsetBpm: 6 }), 'early')
    const late = rides(3, (id, over) => steadyRide(RIDER, id, over), 'late')
    const { basis } = setOf([...early, ...late])
    if ('refused' in basis.heart) throw new Error(basis.heart.refused)
    const earlyTop = windowFrame(basis.heart, 0, 3).highest
    const lateTop = windowFrame(basis.heart, 3, 6).highest
    expect(earlyTop - lateTop).toBeCloseTo(6, 6)
    expect(windowFrame(basis.heart, 0, 6).highest).toBeCloseTo(earlyTop, 6)
  })

  it('asks the climb of the window’s own power estimate: the same slope is a small climb at a low power', () => {
    // Steady rides near 235 climb 47 bpm from half to full power; three easy rides near 95 climb 19.
    const gentle = rides(
      3,
      (id, over) => ({ id, hardS: 1200, hardPower: 100, easyPower: 70, ...over }),
      'gentle',
    )
    const { basis, ages } = setOf([...steady, ...gentle])
    expect(estimateOver(basis, ages, 0, 6)!.heartRate).not.toHaveProperty('refused')
    expect(estimateOver(basis, ages, 6, 9)!.heartRate).toEqual({ refused: 'flat' })
  })

  it('has no estimate for a window of rides with no effort of 3 min or more', () => {
    const { basis, ages } = setOf(steady)
    expect(estimateOver(basis, ages, 2, 2)).toBeNull()
  })

  it('refuses heart rate with no threshold heart rate, or with the line’s own refusal, in every window', () => {
    const { prepared, ages, line } = setOf(steady)
    const none = thresholdBasis(prepared, line, null)
    expect(estimateOver(none, ages, 0, 3)!.heartRate).toEqual({ refused: 'no-heart-rate' })
    const stuck = thresholdBasis(prepared, { refused: 'stuck' }, THRESHOLD_HR)
    expect(estimateOver(stuck, ages, 0, 3)!.heartRate).toEqual({ refused: 'stuck' })
  })
})

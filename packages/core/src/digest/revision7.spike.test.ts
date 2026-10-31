import { describe, expect, it } from 'vitest'
import { lonePowerSpikes } from '../quality/powerOutlier'
import type { ActivityDigest } from '../types'
import { digestActivity } from './digestActivity'
import { POWER_RIDE_AT, powerRide } from './test/gateFixturesPower'

/**
 * One bad second must neither lose a best nor make one (revision 7). A half-hour ride at a steady 250 W, with one
 * second altered: dropped (NaN) or a lone spike. What revision 6 did with the same rides is recorded in the cases'
 * names; identity.rev7.test.ts pins the digests that moved.
 */

const AT = POWER_RIDE_AT
const ride = (change: (power: Float64Array) => void) => powerRide('ride', change)

const best = (digest: ActivityDigest, durationS: number) =>
  digest.curve.find((point) => point.durationS === durationS)!.value

describe('one bad second', () => {
  const dropped = ride((power) => {
    power[AT] = Number.NaN
  })

  it('removes no best (revision 6 lost every best longer than about half the ride): a window may hold 1% unusable seconds and is the mean of the rest', () => {
    const digest = digestActivity(dropped)
    expect(best(digest, 1200)).toBeCloseTo(250, 6)
    expect(best(digest, 1800)).toBeCloseTo(250, 6)
  })

  it('leaves the short bests as they were away from the gap', () => {
    const seven = digestActivity(dropped)
    // A 5 s window away from the gap is untouched: every best is the steady 250 W.
    expect(best(seven, 5)).toBeCloseTo(250, 6)
  })
})

describe('a lone power spike', () => {
  const spiked = ride((power) => {
    power[AT] = 1500
  })

  it('makes no best (revision 6 made the 5 s best 550 W), and is flagged', () => {
    const seven = digestActivity(spiked)
    expect(best(seven, 5)).toBeCloseTo(250, 6)
    expect(best(seven, 60)).toBeCloseTo(250, 6)
    const flags = seven.flags.filter((flag) => flag.kind === 'power-spike')
    expect(flags.map((flag) => [flag.start, flag.end])).toEqual([[AT - 1, AT + 2]])
  })

  it('flags a second over 2,000 W once, by the rule that always did, not again by this one', () => {
    const huge = ride((power) => {
      power[AT] = 2500
    })
    const flags = digestActivity(huge).flags.filter((flag) => flag.kind === 'power-spike')
    expect(flags).toHaveLength(1)
    expect(best(digestActivity(huge), 5)).toBeCloseTo(250, 6)
  })

  it('leaves a sprint alone: power that rises over seconds and stays is not a lone second', () => {
    const sprint = ride((power) => {
      power.fill(1100, AT, AT + 6)
      power[AT - 1] = 600
      power[AT + 6] = 700
    })
    expect(lonePowerSpikes(sprint.power)).toEqual([])
    expect(best(digestActivity(sprint), 5)).toBeCloseTo(1100, 6)
  })

  it('does not move a ride with nothing wrong: every best is the steady power', () => {
    const steady = digestActivity(ride(() => undefined))
    expect(best(steady, 5)).toBeCloseTo(250, 6)
    expect(best(steady, 600)).toBeCloseTo(250, 6)
    expect(steady.flags).toEqual([])
  })
})

describe('lonePowerSpikes', () => {
  it('needs a rise of 700 W and twice the higher neighbour, with both neighbours read', () => {
    const at = (values: number[]) => lonePowerSpikes(Float64Array.from(values))
    expect(at([200, 1000, 200])).toEqual([1])
    expect(at([200, 800, 200])).toEqual([]) // under the rise
    expect(at([800, 1600, 1200])).toEqual([]) // under twice the neighbour
    expect(at([200, 1000, Number.NaN])).toEqual([]) // a neighbour is missing
    expect(at([1000, 200, 200])).toEqual([]) // an edge has one neighbour
  })
})

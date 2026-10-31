import { describe, expect, it } from 'vitest'
import { lonePowerSpikes } from '../quality/powerOutlier'
import type { Activity, ActivityDigest } from '../types'
import { digestActivityAt } from './digestActivity'
import { syntheticActivity } from './test/syntheticActivity'

/**
 * One bad second must neither lose a best nor make one (revision 7, gated). A half-hour ride at a steady 250 W, with
 * one second altered: dropped (NaN) or a lone spike. Below revision 7 the bytes are as they were; the gate's own
 * proof is identity.gate.test.ts, and these show the two behaviours side by side.
 */

const N = 1800
const AT = 900

function ride(change: (power: Float64Array) => void): Activity {
  const power = new Float64Array(N).fill(250)
  change(power)
  return syntheticActivity({
    id: 'ride',
    sport: 'ride',
    n: N,
    power,
    speed: new Float64Array(N).fill(8),
  })
}

const best = (digest: ActivityDigest, durationS: number) =>
  digest.curve.find((point) => point.durationS === durationS)!.value

describe('one bad second', () => {
  const dropped = ride((power) => {
    power[AT] = Number.NaN
  })

  it('removes every best longer than about half the ride below revision 7, since each such window holds it', () => {
    const six = digestActivityAt(dropped, 6)
    expect(best(six, 1200)).toBeNaN()
    expect(best(six, 1800)).toBeNaN()
    expect(best(six, 600)).toBeCloseTo(250, 6)
  })

  it('removes none at revision 7: a window may hold 1% unusable seconds and is the mean of the rest', () => {
    const seven = digestActivityAt(dropped, 7)
    expect(best(seven, 1200)).toBeCloseTo(250, 6)
    expect(best(seven, 1800)).toBeCloseTo(250, 6)
  })

  it('leaves the short bests as they were away from the gap', () => {
    const seven = digestActivityAt(dropped, 7)
    // A 5 s window away from the gap is untouched: every best is the steady 250 W.
    expect(best(seven, 5)).toBeCloseTo(250, 6)
  })
})

describe('a lone power spike', () => {
  const spiked = ride((power) => {
    power[AT] = 1500
  })

  it('makes the short bests below revision 7', () => {
    expect(best(digestActivityAt(spiked, 6), 5)).toBeCloseTo((1500 + 4 * 250) / 5, 6)
  })

  it('makes none at revision 7, and is flagged', () => {
    const seven = digestActivityAt(spiked, 7)
    expect(best(seven, 5)).toBeCloseTo(250, 6)
    expect(best(seven, 60)).toBeCloseTo(250, 6)
    const flags = seven.flags.filter((flag) => flag.kind === 'power-spike')
    expect(flags.map((flag) => [flag.start, flag.end])).toEqual([[AT - 1, AT + 2]])
  })

  it('leaves a sprint alone: power that rises over seconds and stays is not a lone second', () => {
    const sprint = ride((power) => {
      power.fill(1100, AT, AT + 6)
      power[AT - 1] = 600
      power[AT + 6] = 700
    })
    expect(lonePowerSpikes(sprint.power)).toEqual([])
    expect(best(digestActivityAt(sprint, 7), 5)).toBeCloseTo(1100, 6)
  })

  it('does not move a ride with nothing wrong, at either revision', () => {
    const steady = ride(() => undefined)
    expect(digestActivityAt(steady, 7).curve).toEqual(digestActivityAt(steady, 6).curve)
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

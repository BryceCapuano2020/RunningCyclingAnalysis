import { describe, expect, it } from 'vitest'
import { powerEstimate, rideEstimates, rideWeight } from './powerEstimate'
import type { ThresholdEffort } from './types'

/** A ride whose only effort is 20 min at `value`, so its estimate is value / 1.053. */
const ride = (id: string, value: number, over: Partial<ThresholdEffort> = {}): ThresholdEffort => ({
  activityId: id,
  durationS: 1200,
  value,
  heartRate: null,
  ageDays: 0,
  estimated: false,
  ...over,
})
const estimate = (value: number) => value / 1.053

describe('the power estimate', () => {
  it('takes each ride’s strongest effort scaled to an hour', () => {
    const rides = rideEstimates([
      ride('a', 200),
      ride('a', 150, { durationS: 3600 }),
      ride('a', 300, { durationS: 180 }),
    ])
    expect(rides).toHaveLength(1)
    // 200 / 1.053 = 190, 150 / 1 = 150, and 300 / (1.015 + 0.76 / 3) = 236.
    expect(rides[0]!.durationS).toBe(180)
    expect(rides[0]!.value).toBeCloseTo(300 / (1.015 + 0.76 / 3), 6)
  })

  it('is null with no effort of 3 min or more', () => {
    expect(powerEstimate([])).toBeNull()
    expect(
      powerEstimate([ride('a', 400, { durationS: 60 }), ride('b', 300, { durationS: 179 })]),
    ).toBeNull()
    expect(powerEstimate([ride('a', 0), ride('b', NaN), ride('c', -5)])).toBeNull()
  })

  it('does not let a lone freak ride set the answer', () => {
    const normal = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ride(id, 200 + i * 0.5, { ageDays: i }))
    const without = powerEstimate(normal)!
    const withFreak = powerEstimate([...normal, ride('odd', 300)])!
    expect(withFreak.value).toBeCloseTo(without.value, 0)
    expect(withFreak.value).toBeLessThan(estimate(210))
    // Named for the ride the estimate kept, not the freak.
    expect(withFreak.strongest.activityId).not.toBe('odd')
    expect(withFreak.rides).toBe(6)
  })

  it('judges the rides by the second-strongest, so two strong rides are both believed', () => {
    const rides = [ride('a', 230), ride('b', 232), ride('c', 200), ride('d', 201)]
    expect(powerEstimate(rides)!.value).toBeGreaterThan(estimate(215))
  })

  it('counts estimated watts for 0.4 of measured ones', () => {
    const measured = ride('m', 200)
    const guessed = ride('m', 200, { estimated: true })
    const top = estimate(200)
    expect(
      rideWeight(rideEstimates([guessed])[0]!, top) /
        rideWeight(rideEstimates([measured])[0]!, top),
    ).toBeCloseTo(0.4, 10)
  })

  it('is pulled less by estimated watts than by measured ones', () => {
    const base = [ride('a', 200), ride('b', 200), ride('c', 200)]
    const high = (estimated: boolean) => ['x', 'y', 'z'].map((id) => ride(id, 206, { estimated }))
    const pulledByEstimated = powerEstimate([...base, ...high(true)])!.value
    const pulledByMeasured = powerEstimate([...base, ...high(false)])!.value
    expect(pulledByEstimated).toBeLessThan(pulledByMeasured)
    expect(pulledByEstimated).toBeGreaterThan(estimate(200))
  })

  it('halves a ride’s weight every 42 days', () => {
    const ride0 = rideEstimates([ride('a', 200)])[0]!
    const older = rideEstimates([ride('a', 200, { ageDays: 42 })])[0]!
    expect(rideWeight(older, ride0.value) / rideWeight(ride0, ride0.value)).toBeCloseTo(0.5, 10)
  })

  it('gives a ride 4% under the top half the weight of one at it, and a ride 8% under almost none', () => {
    const one = rideEstimates([ride('a', 200)])[0]!
    const atTop = rideWeight(one, one.value / 1.3)
    expect(rideWeight(one, one.value / 0.96) / atTop).toBeCloseTo(0.5, 4)
    expect(rideWeight(one, one.value / 0.92) / atTop).toBeLessThan(0.1)
  })

  it('is never surer than 2.5% however many rides agree', () => {
    const many = Array.from({ length: 40 }, (_, i) => ride(`r${i}`, 200))
    expect(powerEstimate(many)!.relativeError).toBe(0.025)
  })
})

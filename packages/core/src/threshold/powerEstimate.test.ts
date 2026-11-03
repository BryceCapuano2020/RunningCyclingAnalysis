import { describe, expect, it } from 'vitest'
import { DURATION_TABLES } from './durationTables'
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

  it('scales an effort over 60 min by the same formula: a 90 min best lifts the estimate, and is not refused', () => {
    const ninety = ride('a', 200, { durationS: 5400 })
    const hour = rideEstimates([ride('a', 200, { durationS: 3600 })])[0]!.value
    const longer = rideEstimates([ninety])[0]!.value
    // The ratio is 1 at 60 min and keeps falling: 1.053 - 0.053 * ln(4.5) / ln(3) at 90 min.
    expect(hour).toBeCloseTo(200, 8)
    expect(longer).toBeCloseTo(200 / (1.053 - (0.053 * Math.log(4.5)) / Math.log(3)), 8)
    expect(longer).toBeGreaterThan(hour)
    expect(powerEstimate([ninety])!.value).toBeCloseTo(longer, 8)
  })

  it('takes a single ride at its own estimate, a little unsure', () => {
    const only = powerEstimate([ride('a', 200)])!
    expect(only.value).toBeCloseTo(estimate(200), 8)
    expect(only.rides).toBe(1)
    expect(only.strongest).toEqual({ activityId: 'a', durationS: 1200, estimated: false })
    // One ride at the top weighs 1 / 2.5% squared, less the logistic's 0.93: just over the floor of 2.5%.
    expect(only.relativeError).toBeGreaterThan(0.025)
    expect(only.relativeError).toBeLessThan(0.03)
  })

  it('is null where no ride has any weight: an age that is not a number, or too old for any weight to be left', () => {
    expect(powerEstimate([ride('a', 200, { ageDays: NaN })])).toBeNull()
    expect(
      powerEstimate([ride('a', 200, { ageDays: 1e6 }), ride('b', 200, { ageDays: 2e6 })]),
    ).toBeNull()
    // One ride with weight is enough: the others count as rides but not toward the mean.
    const mixed = powerEstimate([ride('a', 200, { ageDays: NaN }), ride('b', 210)])!
    expect(mixed.value).toBeCloseTo(estimate(210), 8)
    expect(mixed.rides).toBe(2)
    expect(mixed.strongest.activityId).toBe('b')
  })

  it('says whether the strongest ride’s watts were estimated', () => {
    const others = [ride('b', 200), ride('c', 200)]
    expect(powerEstimate([ride('a', 205, { estimated: true }), ...others])!.strongest).toEqual({
      activityId: 'a',
      durationS: 1200,
      estimated: true,
    })
    expect(powerEstimate([ride('a', 205), ...others])!.strongest.estimated).toBe(false)
  })
})

describe('an hour done as a floor', () => {
  const hour = (id: string, value: number, over: Partial<ThresholdEffort> = {}) =>
    ride(id, value, { durationS: 3600, ...over })
  // Six rides whose 20 min bests imply 190.
  const others = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ride(id, 190 * 1.053))

  it('puts the answer at the hour when the mean of the estimates is under it, and names that hour', () => {
    const result = powerEstimate([...others, hour('long', 200)])!
    expect(result.value).toBe(200)
    expect(result.floor).toBe(200)
    expect(result.strongest).toEqual({ activityId: 'long', durationS: 3600, estimated: false })
    // The hour is a ride like the others in the count.
    expect(result.rides).toBe(7)
  })

  it('leaves the mean alone when the hour is under it, and still says what the hour was', () => {
    const result = powerEstimate([...others, hour('long', 150)])!
    expect(result.value).toBeCloseTo(190, 6)
    expect(result.floor).toBe(150)
    expect(result.strongest.durationS).toBe(1200)
  })

  it('has no floor without an effort of an hour or longer', () => {
    expect(powerEstimate(others)!.floor).toBe(0)
  })

  it('takes the best hour in the window, from any ride and at its own value', () => {
    const result = powerEstimate([...others, hour('x', 198), hour('y', 205), hour('z', 201)])!
    expect(result.value).toBe(205)
    expect(result.strongest.activityId).toBe('y')
  })

  it('reads a longer effort at what was held, not scaled up', () => {
    const result = powerEstimate([...others, ride('long', 200, { durationS: 5400 })])!
    expect(result.floor).toBe(200)
    expect(result.value).toBeCloseTo(200, 6)
    expect(result.strongest).toMatchObject({ activityId: 'long', durationS: 5400 })
  })

  it('counts an hour from an old ride: the window is the limit, not the recency weight', () => {
    const result = powerEstimate([...others, hour('old', 200, { ageDays: 400 })])!
    expect(result.value).toBe(200)
  })

  it('says the hour was estimated where its watts were', () => {
    const result = powerEstimate([...others, hour('long', 200, { estimated: true })])!
    expect(result.strongest.estimated).toBe(true)
  })

  it('floors a runner’s answer as well, with the runner’s table for the rest', () => {
    const runs = ['a', 'b', 'c'].map((id) => ride(id, 14 * DURATION_TABLES.run.ratio(1200)))
    const result = powerEstimate([...runs, hour('long', 15)], DURATION_TABLES.run)!
    expect(result.value).toBe(15)
  })
})

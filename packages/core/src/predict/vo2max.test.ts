import { describe, expect, it } from 'vitest'
import { VO2MAX_MIN_WINDOW_S } from '../constants'
import { flatSpeedToMetabolic } from '../metabolic/converters'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { oxygenCost } from './daniels'
import { fastestMileSpeed, vo2maxFromHeartRate } from './vo2max'
import {
  MIN_SHARE_WEIGHT,
  VO2MAX_SHARE_FULL,
  VO2MAX_SHARE_ZERO,
  shareWeight,
  weightedMedian,
} from './vo2maxShare'

const REFERENCE = 200

/** A run whose best windows hold 4 m/s flat at the given heart rates, by duration. */
function run(
  id: string,
  heartRates: Record<number, number | null>,
  over: Partial<ActivityDigest> = {},
) {
  const curve: DigestCurvePoint[] = Object.entries(heartRates).map(([d, heartRate]) => ({
    durationS: Number(d),
    value: flatSpeedToMetabolic(4),
    startIndex: 0,
    windowS: Number(d),
    heartRate,
    terms: null,
  }))
  return { id, sport: 'run', hasHeartRate: true, indoor: false, curve, ...over } as ActivityDigest
}

// Swain et al. 1994: 90% of maximum heart rate is (90 - 37) / 0.64 = 82.8% of VO2max.
const AT_90 = oxygenCost(240) / ((90 - 37) / 64)

describe('vo2maxFromHeartRate', () => {
  it('divides the oxygen cost of the pace by the share of VO2max its heart rate implies', () => {
    const runs = [run('a', { 1200: 180 }), run('b', { 1200: 180 })]
    const estimate = vo2maxFromHeartRate(runs, REFERENCE, (p) => p.value)
    expect(estimate?.vo2max).toBeCloseTo(AT_90, 6)
    expect(estimate?.runs).toBe(2)
  })

  it('reads each run at its longest window hard enough, and takes the median of the runs', () => {
    const runs = [
      run('a', { 600: 190, 1800: 180 }),
      run('b', { 1200: 180 }),
      run('c', { 1200: REFERENCE * VO2MAX_SHARE_ZERO - 1 }),
    ]
    // The run under the ramp counts for nothing, so there are two runs.
    expect(vo2maxFromHeartRate(runs, REFERENCE, (p) => p.value)).toMatchObject({ runs: 2 })
    expect(vo2maxFromHeartRate(runs, REFERENCE, (p) => p.value)?.vo2max).toBeCloseTo(AT_90, 6)
  })

  it('needs two runs, a reference, and leaves out treadmill runs, rides and short windows', () => {
    const one = [run('a', { 1200: 180 })]
    expect(vo2maxFromHeartRate(one, REFERENCE, (p) => p.value)).toBeNull()
    const others = [
      run('t', { 1200: 180 }, { indoor: true }),
      run('r', { 1200: 180 }, { sport: 'ride' }),
      run('s', { [VO2MAX_MIN_WINDOW_S - 1]: 190 }),
      run('a', { 1200: 180 }),
    ]
    expect(vo2maxFromHeartRate(others, REFERENCE, (p) => p.value)).toBeNull()
    expect(vo2maxFromHeartRate([...one, ...one], null, (p) => p.value)).toBeNull()
  })

  it('leaves out a window faster on the flat than the fastest mile as run, and counts it', () => {
    const mile = { distanceM: 1609.344, seconds: 1609.344 / 3.9 }
    const runs = [
      run('a', { 1200: 180 }, { distanceBests: [mile] }),
      run('b', { 1200: 180 }),
      run('c', { 1200: 180 }),
    ]
    // Every window holds 4 m/s, faster than the 3.9 m/s mile, so none is used.
    expect(vo2maxFromHeartRate(runs, REFERENCE, (p) => p.value)).toBeNull()
    const slower = [
      run('a', { 1200: 180 }, { distanceBests: [{ ...mile, seconds: 1609.344 / 4.2 }] }),
      ...runs.slice(1),
    ]
    expect(vo2maxFromHeartRate(slower, REFERENCE, (p) => p.value)).toMatchObject({
      runs: 3,
      hillCapped: 0,
    })
    const mixed = vo2maxFromHeartRate(runs, REFERENCE, (p) => p.value, 4.1)
    expect(mixed).toMatchObject({ runs: 3, hillCapped: 0 })
    expect(vo2maxFromHeartRate(runs, REFERENCE, (p) => p.value, 3.9)).toBeNull()
  })

  it('reads the fastest mile as run, and caps nothing without one', () => {
    expect(
      fastestMileSpeed([run('a', {}, { distanceBests: [{ distanceM: 1609.344, seconds: 400 }] })]),
    ).toBeCloseTo(1609.344 / 400, 9)
    expect(fastestMileSpeed([run('a', {})])).toBe(Infinity)
  })

  it('does not let an indoor run’s faster mile lift the cap', () => {
    const outdoor = run('a', {}, { distanceBests: [{ distanceM: 1609.344, seconds: 400 }] })
    const indoor = run(
      'b',
      {},
      { indoor: true, distanceBests: [{ distanceM: 1609.344, seconds: 300 }] },
    )
    expect(fastestMileSpeed([outdoor, indoor])).toBeCloseTo(1609.344 / 400, 9)
    expect(fastestMileSpeed([indoor])).toBe(Infinity)
  })
})

describe('the share ramp', () => {
  it('counts nothing under the old line, half on it, everything from the full share, and a straight line between', () => {
    expect(VO2MAX_SHARE_ZERO).toBe(0.85)
    expect(shareWeight(VO2MAX_SHARE_ZERO)).toBe(MIN_SHARE_WEIGHT)
    expect(shareWeight(VO2MAX_SHARE_ZERO - 1e-9)).toBe(0)
    expect(shareWeight(0.5)).toBe(0)
    expect(shareWeight(VO2MAX_SHARE_FULL)).toBe(1)
    expect(shareWeight(1.02)).toBe(1)
    expect(shareWeight((VO2MAX_SHARE_ZERO + VO2MAX_SHARE_FULL) / 2)).toBeCloseTo(
      (MIN_SHARE_WEIGHT + 1) / 2,
      12,
    )
    let last = 0
    for (let share = 0.7; share <= 1; share += 0.005) {
      const weight = shareWeight(share)
      expect(weight).toBeGreaterThanOrEqual(last)
      last = weight
    }
  })

  it('takes the ordinary median for equal weights, and a weight moves the answer continuously', () => {
    const at = (values: number[]) => weightedMedian(values.map((value) => ({ value, weight: 1 })))
    expect(at([3, 1, 2])).toBe(2)
    expect(at([4, 1, 2, 3])).toBe(2.5)
    expect(at([7])).toBe(7)
    expect(weightedMedian([{ value: 1, weight: 0 }])).toBeNaN()
    // A value of weight w between two full ones: 2 whatever w is, and a high value of weight w lifts the median smoothly
    // from the middle of {1, 3} (2) towards 3 as it gains weight.
    const lift = (w: number) =>
      weightedMedian([
        { value: 1, weight: 1 },
        { value: 3, weight: 1 },
        { value: 9, weight: w },
      ])
    let last = lift(0.01)
    for (let w = 0.05; w <= 1; w += 0.05) {
      const next = lift(w)
      expect(next).toBeGreaterThanOrEqual(last)
      expect(next - last).toBeLessThan(0.6)
      last = next
    }
    expect(lift(0.01)).toBeCloseTo(2, 1)
    expect(lift(1)).toBe(3)
  })

  it('moves smoothly where a run crosses the old line of 85%, which used to move it in one step', () => {
    // Three runs at 90% and one that drifts across 85% of the reference: 169 bpm is 84.5%, 171 bpm is 85.5%.
    const full = [run('a', { 1200: 180 }), run('b', { 1200: 180 }), run('c', { 1200: 178 })]
    const at = (bpm: number) =>
      vo2maxFromHeartRate([...full, run('d', { 1200: bpm })], REFERENCE, (p) => p.value)!
    expect(Math.abs(at(171).vo2max / at(169).vo2max - 1)).toBeLessThan(0.03)
    // The count is the old one: the run is one of them from the line.
    expect([at(169).runs, at(171).runs]).toEqual([3, 4])
    // From the old line up to a full 90%, the estimate walks and never jumps.
    let last = at(170).vo2max
    for (let bpm = 171; bpm <= 180; bpm++) {
      const next = at(bpm).vo2max
      expect(Math.abs(next / last - 1)).toBeLessThan(0.03)
      last = next
    }
  })

  it('is available as the old gate was: two runs at or over 85% of the reference, however lightly the ramp weighs them', () => {
    const light = (count: number, bpm = 171) =>
      Array.from({ length: count }, (_, i) => run(`f${i}`, { 1200: bpm })) // 85.5%: a light weight each
    expect(vo2maxFromHeartRate(light(1), REFERENCE, (p) => p.value)).toBeNull()
    expect(vo2maxFromHeartRate(light(2), REFERENCE, (p) => p.value)).not.toBeNull()
    // On the line itself (170 of 200) counts, as it always did.
    expect(vo2maxFromHeartRate(light(2, 170), REFERENCE, (p) => p.value)).not.toBeNull()
    // Under the line counts for nothing, whatever their number.
    expect(vo2maxFromHeartRate(light(6, 169), REFERENCE, (p) => p.value)).toBeNull()
    // Two runs of the same pace and heart rate share give one estimate, whatever they weigh: equal weights, one value.
    const same = (bpm: number) => vo2maxFromHeartRate(light(2, bpm), REFERENCE, (p) => p.value)
    expect(same(171)?.runs).toBe(2)
    expect(same(171)?.vo2max).toBeCloseTo(oxygenCost(240) / (((171 / 200) * 100 - 37) / 64), 6)
    expect(same(180)?.vo2max).toBeCloseTo(AT_90, 6)
  })

  it('counts as its runs every one at or over the line, so “on N hard runs” is the old count', () => {
    const full = [run('a', { 1200: 184 }), run('b', { 1200: 184 })]
    const light = [171, 172, 173].map((bpm, i) => run(`l${i}`, { 1200: bpm })) // 85.5% to 86.5%
    const under = [run('u', { 1200: 169 })]
    expect(
      vo2maxFromHeartRate([...full, ...light, ...under], REFERENCE, (p) => p.value)?.runs,
    ).toBe(5)
  })
})

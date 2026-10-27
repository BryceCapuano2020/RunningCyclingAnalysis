import { describe, expect, it } from 'vitest'
import { VO2MAX_MIN_HR_SHARE, VO2MAX_MIN_WINDOW_S } from '../constants'
import { flatSpeedToMetabolic } from '../metabolic/converters'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { oxygenCost } from './daniels'
import { fastestMileSpeed, vo2maxFromHeartRate } from './vo2max'

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
      run('c', { 1200: REFERENCE * VO2MAX_MIN_HR_SHARE - 1 }),
    ]
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
})

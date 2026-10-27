import { describe, expect, it } from 'vitest'
import { VO2MAX_MIN_HR_SHARE, VO2MAX_MIN_WINDOW_S } from '../constants'
import { flatSpeedToMetabolic } from '../metabolic/converters'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { oxygenCost } from './daniels'
import { vo2maxFromHeartRate } from './vo2max'

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
})

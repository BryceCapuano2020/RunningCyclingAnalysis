import { describe, expect, it } from 'vitest'
import type { Curve, HrCrossCheck } from '../types'
import { compareSports } from './compareSports'

const MASS_KG = 70
const GE_MEAN = 0.215

function curve(durations: number[], values: number[]): Curve {
  return durations.map((durationS, i) => ({
    durationS,
    value: values[i]!,
    activityId: null,
    startIndex: -1,
  }))
}

function hrCheck(kappa: number | null, lnKappaSe: number | null): HrCrossCheck {
  return { run: null, ride: null, kappa, lnKappaSe }
}

/** Run curve at metabolic value v (W/kg), and the ride curve that represents the same v. */
function equalCurves(durations: number[], v: number[]): { run: Curve; ride: Curve } {
  return {
    run: curve(durations, v),
    ride: curve(
      durations,
      v.map((x) => GE_MEAN * MASS_KG * x),
    ),
  }
}

describe('compareSports', () => {
  it('rejects a body mass that is not a positive finite number', () => {
    const { run, ride } = equalCurves([60], [4])
    for (const massKg of [0, -70, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => compareSports(run, ride, massKg, null)).toThrow(RangeError)
    }
  })

  it('has a prior median ratio of 1 when the curves agree in metabolic terms', () => {
    const { run, ride } = equalCurves([60], [4])
    const result = compareSports(run, ride, MASS_KG, null)
    const ratio = result.prior[0]!.ratio
    expect(Math.abs(ratio.p50 - 1)).toBeLessThan(0.01)
    expect(ratio.p05).toBeLessThan(1)
    expect(ratio.p95).toBeGreaterThan(1)
  })

  it('has a prior 5 to 95 band of roughly the width the priors imply', () => {
    // At 20 W/kg the log ratio has sd of about sqrt(0.0558^2 + 0.939^2 * 0.06^2) = 0.079,
    // so the 5 to 95 band is about 2 * 1.645 * 0.079 = 0.26 of the median.
    const { run, ride } = equalCurves([60], [20])
    const ratio = compareSports(run, ride, MASS_KG, null).prior[0]!.ratio
    const relWidth = (ratio.p95 - ratio.p05) / ratio.p50
    expect(relWidth).toBeGreaterThan(0.22)
    expect(relWidth).toBeLessThan(0.3)
  })

  it('shifts the calibrated median down by about 9% and narrows the band for kappa 1.1', () => {
    // The ratio scales with GE * s, and kappa-draw = (0.215 / GE) / s, so kappa 1.1 pins
    // GE * s near 0.215 / 1.1, giving a median ratio near 1 / 1.1 = 0.909.
    const { run, ride } = equalCurves([60], [20])
    const result = compareSports(run, ride, MASS_KG, hrCheck(1.1, 0.02))
    const prior = result.prior[0]!.ratio
    const calibrated = result.calibrated![0]!.ratio
    const shift = calibrated.p50 / prior.p50
    expect(shift).toBeGreaterThan(0.89)
    expect(shift).toBeLessThan(0.93)
    const priorWidth = prior.p95 - prior.p05
    const calibratedWidth = calibrated.p95 - calibrated.p05
    expect(calibratedWidth).toBeLessThan(0.5 * priorWidth)
  })

  it('returns calibrated null when kappa or lnKappaSe is missing', () => {
    const { run, ride } = equalCurves([60], [4])
    expect(compareSports(run, ride, MASS_KG, null).calibrated).toBeNull()
    expect(compareSports(run, ride, MASS_KG, hrCheck(null, null)).calibrated).toBeNull()
    expect(compareSports(run, ride, MASS_KG, hrCheck(1.1, null)).calibrated).toBeNull()
    expect(compareSports(run, ride, MASS_KG, hrCheck(null, 0.05)).calibrated).toBeNull()
  })

  it('keeps the finite prior when heart-rate evidence conflicts with the sampled model', () => {
    const { run, ride } = equalCurves([60], [20])
    const prior = compareSports(run, ride, MASS_KG, null).prior
    for (const kappa of [3, 10]) {
      const result = compareSports(run, ride, MASS_KG, hrCheck(kappa, 0.05))
      expect(result.prior).toEqual(prior)
      expect(result.calibrated).toBeNull()
      expect(result.calibration?.accepted).toBe(false)
      expect(result.calibration?.effectiveSamples).toBeLessThan(40)
      expect(Number.isFinite(result.prior[0]!.ratio.p50)).toBe(true)
    }
  })

  it('omits durations where either curve is NaN', () => {
    const durations = [60, 300, 1200]
    const run = curve(durations, [20, Number.NaN, 20])
    const ride = curve(durations, [301, 301, 301])
    const result = compareSports(run, ride, MASS_KG, hrCheck(1.1, 0.02))
    expect(result.prior.map((p) => p.durationS)).toEqual([60, 1200])
    expect(result.calibrated!.map((p) => p.durationS)).toEqual([60, 1200])

    const rideNaN = curve(durations, [301, 301, Number.NaN])
    const result2 = compareSports(run, rideNaN, MASS_KG, null)
    expect(result2.prior.map((p) => p.durationS)).toEqual([60])
  })

  it('throws when the curves have different lengths or durations', () => {
    expect(() =>
      compareSports(curve([60], [4]), curve([60, 300], [240, 1200]), MASS_KG, null),
    ).toThrow(/lengths/)
    expect(() => compareSports(curve([60], [4]), curve([120], [240]), MASS_KG, null)).toThrow(
      /durations/,
    )
  })

  it('is deterministic for a given seed and changes with the seed', () => {
    const { run, ride } = equalCurves([60, 300], [8, 5])
    const hr = hrCheck(1.1, 0.05)
    const a = compareSports(run, ride, MASS_KG, hr, { seed: 7 })
    const b = compareSports(run, ride, MASS_KG, hr, { seed: 7 })
    expect(a).toEqual(b)
    const c = compareSports(run, ride, MASS_KG, hr, { seed: 8 })
    expect(c).not.toEqual(a)
  })
})

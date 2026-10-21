import { describe, expect, it } from 'vitest'
import type { BikeModel, CalibrationSums } from '../types'
import { solveBikeModel } from '../virtualPower'
import type { CalibrationStats } from '../virtualPower'
import { referenceRideStats } from './test/reference'
import type { SyntheticRide } from '../virtualPower/syntheticRides'
import { makeRide, wave } from '../virtualPower/syntheticRides'
import {
  addCalibrationSums,
  calibrationStatsAt,
  calibrationSums,
  emptyCalibrationSums,
  subtractCalibrationSums,
} from './calibration'
import { sampleTerms } from './terms'

const MASS = 80
const TRUE_MODEL: BikeModel = { crr: 0.006, cda: 0.35 }
const N = 1800

function sumsOf(ride: SyntheticRide): CalibrationSums {
  return calibrationSums(sampleTerms(ride.speed, ride.grade), ride.speed, ride.power, ride.valid)
}

/** Multiplies power by a slowly varying factor so that the rides fit different bikes. */
function withNoise(ride: SyntheticRide, k: number): SyntheticRide {
  for (let i = 0; i < ride.power.length; i++) {
    ride.power[i] = ride.power[i]! * (1 + 0.03 * Math.sin(i * 0.37 + k))
  }
  return ride
}

/** Three rides with varied speed (including acceleration) and grade, all with positive power. */
function trueRides(model = TRUE_MODEL): SyntheticRide[] {
  return [
    makeRide('a', wave(N, 7, 1, 400, 0), wave(N, 0.03, 0.04, 500, 0), model, MASS),
    makeRide('b', wave(N, 9, 1.5, 300, 1), wave(N, 0.02, 0.04, 700, 2), model, MASS),
    makeRide('c', wave(N, 6, 1, 250, 2.5), wave(N, 0.04, 0.05, 450, 0.5), model, MASS),
  ]
}

const relativeError = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300)

function expectStatsClose(actual: CalibrationStats, expected: CalibrationStats): void {
  expect(actual.blocks).toBe(expected.blocks)
  for (const key of ['s11', 's12', 's22', 's1y', 's2y'] as const) {
    expect(relativeError(actual[key], expected[key]), key).toBeLessThan(1e-10)
  }
}

describe('calibration sums', () => {
  it('rebuild the direct normal equations at any mass, checked at two masses', () => {
    // The mass-free sums must reproduce the mass-dependent statistics exactly (to rounding).
    for (const ride of trueRides().map((r, k) => withNoise(r, k))) {
      const sums = sumsOf(ride)
      for (const mass of [70, 95]) {
        expectStatsClose(calibrationStatsAt(sums, mass), referenceRideStats(ride, mass))
      }
    }
  })

  it('adds and subtracts element-wise, so subtraction undoes addition', () => {
    const a: CalibrationSums = { blocks: 3, rr: 1, ra: 2, aa: 3, rP: 4, rG: 5, aP: 6, aG: 7 }
    const b: CalibrationSums = { blocks: 2, rr: 10, ra: 20, aa: 30, rP: 40, rG: 50, aP: 60, aG: 70 }
    expect(addCalibrationSums(a, b)).toEqual({
      blocks: 5,
      rr: 11,
      ra: 22,
      aa: 33,
      rP: 44,
      rG: 55,
      aP: 66,
      aG: 77,
    })
    expect(subtractCalibrationSums(addCalibrationSums(a, b), b)).toEqual(a)
    expect(addCalibrationSums(emptyCalibrationSums(), a)).toEqual(a)
  })

  it('recovers crr and cda from noise-free rides', () => {
    const total = trueRides().reduce(
      (acc, ride) => addCalibrationSums(acc, sumsOf(ride)),
      emptyCalibrationSums(),
    )
    const fit = solveBikeModel(calibrationStatsAt(total, MASS))
    expect(fit.crr).toBeCloseTo(0.006, 6)
    expect(fit.cda).toBeCloseTo(0.35, 6)
  })

  it('counts the blocks of a ride and skips unusable ones', () => {
    // 900 samples give 30 blocks; a NaN power in block 0 leaves 29.
    const ride = makeRide(
      'c',
      wave(900, 7, 1, 400, 0),
      wave(900, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    expect(sumsOf(ride).blocks).toBe(30)
    ride.power[10] = NaN
    expect(sumsOf(ride).blocks).toBe(29)
  })

  it('needs 20 usable blocks for the fit, so 570 samples give 19 blocks and 600 give 20', () => {
    const short = makeRide(
      's',
      wave(570, 7, 1, 400, 0),
      wave(570, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    expect(sumsOf(short).blocks).toBe(19)
    const exact = makeRide(
      's',
      wave(600, 7, 1, 400, 0),
      wave(600, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    expect(sumsOf(exact).blocks).toBe(20)
  })

  it('ignores blocks with invalid, non-finite, or slow samples', () => {
    const slow = makeRide(
      'slow',
      new Float64Array(N).fill(2),
      new Float64Array(N).fill(0.03),
      TRUE_MODEL,
      MASS,
    )
    expect(sumsOf(slow).blocks).toBe(0)

    const flagged = makeRide(
      'bad',
      wave(N, 7, 1, 400, 0),
      wave(N, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    flagged.valid.fill(0)
    expect(sumsOf(flagged).blocks).toBe(0)

    const nanPower = makeRide(
      'nan',
      wave(N, 7, 1, 400, 0),
      wave(N, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    for (let s = 0; s + 30 <= N; s += 30) nanPower.power[s + 15] = NaN
    expect(sumsOf(nanPower).blocks).toBe(0)
  })

  it('drops a block with a NaN speed even when the sample is marked valid', () => {
    const ride = makeRide('a', wave(N, 7, 1, 400, 0), wave(N, 0.03, 0.04, 500, 0), TRUE_MODEL, MASS)
    const before = sumsOf(ride).blocks
    ride.speed[45] = NaN
    expect(sumsOf(ride).blocks).toBe(before - 1)
  })

  it('drops a single flagged sample without disturbing the rest', () => {
    const ride = trueRides()[0]!
    const before = sumsOf(ride).blocks
    ride.valid[5] = 0
    ride.power[5] = 1e6
    expect(sumsOf(ride).blocks).toBe(before - 1)
  })

  it('returns an empty set of sums for a ride shorter than one block', () => {
    const short = makeRide('s', wave(20, 7, 1, 400, 0), wave(20, 0, 0, 500, 0), TRUE_MODEL, MASS)
    expect(sumsOf(short)).toEqual(emptyCalibrationSums())
  })
})

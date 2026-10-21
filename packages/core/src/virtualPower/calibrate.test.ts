import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL } from '../constants'
import {
  addStats,
  calibrateBikeModel,
  emptyStats,
  rideStats,
  solveBikeModel,
  subtractStats,
} from './calibrate'
import type { CalibrationRide, CalibrationStats } from './calibrate'
import { makeRide, wave } from './syntheticRides'

const MASS = 80
const TRUE_MODEL = { crr: 0.006, cda: 0.35 }
const N = 1800

/** Multiplies power by a slowly varying factor so that fitted models differ per ride. */
function withNoise(ride: CalibrationRide, k: number): CalibrationRide {
  for (let i = 0; i < ride.power.length; i++) {
    ride.power[i] = ride.power[i]! * (1 + 0.03 * Math.sin(i * 0.37 + k))
  }
  return ride
}

/** Three rides with varied speed (including acceleration) and grade, all with positive power. */
function trueRides(model = TRUE_MODEL): CalibrationRide[] {
  return [
    makeRide('a', wave(N, 7, 1, 400, 0), wave(N, 0.03, 0.04, 500, 0), model, MASS),
    makeRide('b', wave(N, 9, 1.5, 300, 1), wave(N, 0.02, 0.04, 700, 2), model, MASS),
    makeRide('c', wave(N, 6, 1, 250, 2.5), wave(N, 0.04, 0.05, 450, 0.5), model, MASS),
  ]
}

describe('calibrateBikeModel', () => {
  it('recovers crr and cda from noise-free synthetic rides', () => {
    const rides = trueRides()
    for (const r of rides) expect(Math.min(...r.power)).toBeGreaterThan(0)
    const fit = calibrateBikeModel(rides, MASS)
    expect(fit.crr).toBeCloseTo(0.006, 6)
    expect(fit.cda).toBeCloseTo(0.35, 6)
  })

  it('clamps crr and cda to their ranges from above', () => {
    const rides = trueRides({ crr: 0.02, cda: 0.6 })
    const fit = calibrateBikeModel(rides, MASS)
    expect(fit.crr).toBe(0.012)
    expect(fit.cda).toBe(0.5)
  })

  it('clamps crr and cda to their ranges from below', () => {
    const rides = trueRides({ crr: 0.0005, cda: 0.1 })
    const fit = calibrateBikeModel(rides, MASS)
    expect(fit.crr).toBe(0.002)
    expect(fit.cda).toBe(0.2)
  })

  it('needs at least 20 usable 30 s blocks', () => {
    // 570 samples give 19 blocks; 600 give 20.
    const short = [
      makeRide('s', wave(570, 7, 1, 400, 0), wave(570, 0.03, 0.04, 500, 0), TRUE_MODEL, MASS),
    ]
    expect(calibrateBikeModel(short, MASS)).toEqual(DEFAULT_BIKE_MODEL)

    const exact = [
      makeRide('s', wave(600, 7, 1, 400, 0), wave(600, 0.03, 0.04, 500, 0), TRUE_MODEL, MASS),
    ]
    const fit = calibrateBikeModel(exact, MASS)
    expect(fit.crr).toBeCloseTo(0.006, 6)
    expect(fit.cda).toBeCloseTo(0.35, 6)
  })

  it('falls back to the default model with no rides', () => {
    expect(calibrateBikeModel([], MASS)).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('falls back to the default model when the normal equations are singular', () => {
    // Constant speed on the flat: every block has the same x1 and x2, so the system is rank 1.
    const flat = (): CalibrationRide =>
      makeRide('flat', new Float64Array(N).fill(8), new Float64Array(N).fill(0), TRUE_MODEL, MASS)
    expect(calibrateBikeModel([flat(), flat(), flat()], MASS)).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('ignores blocks with invalid, non-finite, or slow samples', () => {
    const slow = makeRide(
      'slow',
      new Float64Array(N).fill(2),
      new Float64Array(N).fill(0.03),
      TRUE_MODEL,
      MASS,
    )
    expect(calibrateBikeModel([slow], MASS)).toEqual(DEFAULT_BIKE_MODEL)

    const flagged = makeRide(
      'bad',
      wave(N, 7, 1, 400, 0),
      wave(N, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    flagged.valid.fill(0)
    expect(calibrateBikeModel([flagged], MASS)).toEqual(DEFAULT_BIKE_MODEL)

    const nanPower = makeRide(
      'nan',
      wave(N, 7, 1, 400, 0),
      wave(N, 0.03, 0.04, 500, 0),
      TRUE_MODEL,
      MASS,
    )
    for (let s = 0; s + 30 <= N; s += 30) nanPower.power[s + 15] = NaN
    expect(calibrateBikeModel([nanPower], MASS)).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('drops a single flagged sample without disturbing the fit', () => {
    const rides = trueRides()
    const corrupt = rides[0]!
    corrupt.valid[5] = 0
    corrupt.power[5] = 1e6
    const fit = calibrateBikeModel(rides, MASS)
    expect(fit.crr).toBeCloseTo(0.006, 6)
    expect(fit.cda).toBeCloseTo(0.35, 6)
  })
})

describe('sufficient statistics', () => {
  const stats = (blocks: number, s11: number, s12: number, s22: number, s1y: number, s2y: number) =>
    ({ blocks, s11, s12, s22, s1y, s2y }) satisfies CalibrationStats

  it('adds and subtracts element-wise, so subtraction undoes addition', () => {
    const a = stats(3, 1, 2, 3, 4, 5)
    const b = stats(2, 10, 20, 30, 40, 50)
    expect(addStats(a, b)).toEqual(stats(5, 11, 22, 33, 44, 55))
    expect(subtractStats(addStats(a, b), b)).toEqual(a)
    expect(addStats(emptyStats(), a)).toEqual(a)
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
    expect(rideStats(ride, MASS).blocks).toBe(30)
    ride.power[10] = NaN
    expect(rideStats(ride, MASS).blocks).toBe(29)
  })

  it('solves the normal equations from summed statistics', () => {
    // Rides fitted in one pass and by summing per-ride statistics give the same model.
    const rides = trueRides()
    const summed = rides.reduce((acc, r) => addStats(acc, rideStats(r, MASS)), emptyStats())
    const fit = solveBikeModel(summed)
    expect(fit.crr).toBeCloseTo(0.006, 6)
    expect(fit.cda).toBeCloseTo(0.35, 6)
  })

  it('falls back to the default model with fewer than 20 blocks', () => {
    expect(solveBikeModel(stats(19, 1, 0.5, 2, 1, 1))).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('falls back to the default model when singular or non-finite', () => {
    // Rows (1, 1) repeated: det = 0.
    expect(solveBikeModel(stats(25, 25, 25, 25, 25, 25))).toEqual(DEFAULT_BIKE_MODEL)
    expect(solveBikeModel(stats(25, Infinity, 1, 1, 1, 1))).toEqual(DEFAULT_BIKE_MODEL)
  })

  it('matches calibrating directly on the other rides to 1e-9 for every leave-one-out fold', () => {
    const rides = trueRides().map((r, k) => withNoise(r, k))
    const perRide = rides.map((r) => rideStats(r, MASS))
    const total = perRide.reduce(addStats, emptyStats())
    rides.forEach((_, i) => {
      const others = rides.filter((_r, j) => j !== i)
      const direct = calibrateBikeModel(others, MASS)
      const viaStats = solveBikeModel(subtractStats(total, perRide[i]!))
      expect(viaStats.crr).toBeCloseTo(direct.crr, 9)
      expect(viaStats.cda).toBeCloseTo(direct.cda, 9)
      expect(direct.crr).not.toBe(DEFAULT_BIKE_MODEL.crr)
    })
  })
})

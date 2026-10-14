import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL } from '../constants'
import type { CalibrationRide } from './calibrate'
import { calibrateBikeModel } from './calibrate'
import { leaveOneOutAccuracy, scoreAccuracy } from './accuracy'
import { makeRide, wave } from './syntheticRides'

const MASS = 80
const TRUE_MODEL = { crr: 0.006, cda: 0.35 }
const N = 1800

/** Rides with climbs (grade mean 3%, amplitude 4%) so that segments exist. */
function climbRides(model = TRUE_MODEL): CalibrationRide[] {
  return [
    makeRide('a', wave(N, 7, 1, 400, 0), wave(N, 0.03, 0.04, 500, 0), model, MASS),
    makeRide('b', wave(N, 9, 1.5, 300, 1), wave(N, 0.02, 0.04, 700, 2), model, MASS),
    makeRide('c', wave(N, 6, 1, 250, 2.5), wave(N, 0.04, 0.05, 450, 0.5), model, MASS),
  ]
}

/** One 300 s climb at 5 m/s, 75% grade (sin = 0.6 exactly), with constant measured power. */
function steepRide(measuredW: number): CalibrationRide {
  return {
    activityId: 'steep',
    speed: new Float64Array(300).fill(5),
    grade: new Float64Array(300).fill(0.75),
    power: new Float64Array(300).fill(measuredW),
    valid: new Uint8Array(300).fill(1),
  }
}

const ZERO_MODEL = { crr: 0, cda: 0 }

describe('scoreAccuracy', () => {
  it('computes the hand-known error on a single climb with a zero-resistance model', () => {
    // P = 100 * 9.80665 * 0.6 * 5 / 0.975 = 3017.43 W against 3000 W measured
    const acc = scoreAccuracy([steepRide(3000)], 100, ZERO_MODEL)
    expect(acc.nSegments).toBe(1)
    const seg = acc.segments[0]!
    expect(seg).toEqual({
      activityId: 'steep',
      start: 0,
      end: 300,
      measuredW: 3000,
      estimatedW: expect.any(Number),
    })
    expect(seg.estimatedW).toBeCloseTo(3017.4308, 3)
    // (3017.4308 - 3000) / 3000 = 0.0058103
    expect(acc.mape).toBeCloseTo(0.0058103, 6)
    expect(acc.bias).toBeCloseTo(0.0058103, 6)
  })

  it('has mape near zero when scored with the model that generated the power', () => {
    const acc = scoreAccuracy(climbRides(), MASS, TRUE_MODEL)
    expect(acc.nSegments).toBeGreaterThan(0)
    expect(acc.mape).toBeCloseTo(0, 9)
    expect(acc.bias).toBeCloseTo(0, 9)
  })

  it('has a positive bias with an inflated drag area', () => {
    const acc = scoreAccuracy(climbRides(), MASS, { crr: 0.006, cda: 0.42 })
    expect(acc.nSegments).toBeGreaterThan(0)
    expect(acc.bias).toBeGreaterThan(0)
    // Every climb is overestimated, so mape equals bias.
    expect(acc.mape).toBeCloseTo(acc.bias, 12)
  })

  it('skips segments whose measured mean power is below 50 W', () => {
    const acc = scoreAccuracy([steepRide(49)], 100, ZERO_MODEL)
    expect(acc.nSegments).toBe(0)
    expect(acc.segments).toEqual([])
    expect(Number.isNaN(acc.mape)).toBe(true)
    expect(Number.isNaN(acc.bias)).toBe(true)
  })

  it('keeps segments at exactly 50 W', () => {
    const acc = scoreAccuracy([steepRide(50)], 100, ZERO_MODEL)
    expect(acc.nSegments).toBe(1)
  })

  it('splits a segment at samples with missing measured power or grade', () => {
    const ride = steepRide(3000)
    ride.power[150] = NaN
    const split = scoreAccuracy([ride], 100, ZERO_MODEL)
    expect(split.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 150],
      [151, 300],
    ])
    expect(split.bias).toBeCloseTo(17.4308 / 3000, 3)

    const noGrade = steepRide(3000)
    noGrade.grade[150] = NaN
    expect(scoreAccuracy([noGrade], 100, ZERO_MODEL).nSegments).toBe(2)
  })

  it('ignores samples flagged invalid', () => {
    const ride = steepRide(3000)
    ride.valid.fill(0)
    expect(scoreAccuracy([ride], 100, ZERO_MODEL).nSegments).toBe(0)
  })

  it('scores a long climb in 300 s sections, so one climb can give several points', () => {
    // 1000 s steep climb -> sections of 300, 300 and 400 s, each with the same error.
    const ride: CalibrationRide = {
      activityId: 'long',
      speed: new Float64Array(1000).fill(5),
      grade: new Float64Array(1000).fill(0.75),
      power: new Float64Array(1000).fill(3000),
      valid: new Uint8Array(1000).fill(1),
    }
    const acc = scoreAccuracy([ride], 100, ZERO_MODEL)
    expect(acc.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 300],
      [300, 600],
      [600, 1000],
    ])
    expect(acc.nSegments).toBe(3)
    expect(acc.bias).toBeCloseTo(0.0058103, 6)
    expect(acc.mape).toBeCloseTo(0.0058103, 6)
  })

  it('has no segments on flat ground', () => {
    const flat: CalibrationRide = {
      activityId: 'flat',
      speed: new Float64Array(N).fill(10),
      grade: new Float64Array(N).fill(0),
      power: new Float64Array(N).fill(240),
      valid: new Uint8Array(N).fill(1),
    }
    const acc = scoreAccuracy([flat], MASS, TRUE_MODEL)
    expect(acc.nSegments).toBe(0)
    expect(acc.segments).toEqual([])
    expect(Number.isNaN(acc.mape)).toBe(true)
    expect(Number.isNaN(acc.bias)).toBe(true)
  })

  it('returns no segments for no rides', () => {
    const acc = scoreAccuracy([], MASS, TRUE_MODEL)
    expect(acc.nSegments).toBe(0)
    expect(Number.isNaN(acc.mape)).toBe(true)
  })
})

describe('leaveOneOutAccuracy', () => {
  it('uses the default model for a single ride, so it matches scoring with that model', () => {
    const rides = climbRides().slice(0, 1)
    const loo = leaveOneOutAccuracy(rides, MASS)
    const direct = scoreAccuracy(rides, MASS, DEFAULT_BIKE_MODEL)
    expect(loo.nSegments).toBe(direct.nSegments)
    expect(loo.nSegments).toBeGreaterThan(0)
    expect(loo.mape).toBeCloseTo(direct.mape, 12)
    expect(loo.bias).toBeCloseTo(direct.bias, 12)
    // The default model differs from the truth, so the error is real and non-zero.
    expect(loo.mape).toBeGreaterThan(0)
  })

  it('has no segments for a single flat ride', () => {
    const flat: CalibrationRide = {
      activityId: 'flat',
      speed: new Float64Array(N).fill(10),
      grade: new Float64Array(N).fill(0),
      power: new Float64Array(N).fill(240),
      valid: new Uint8Array(N).fill(1),
    }
    const loo = leaveOneOutAccuracy([flat], MASS)
    expect(loo.nSegments).toBe(0)
    expect(Number.isNaN(loo.mape)).toBe(true)
  })

  it('pools climbs from three rides, each scored by a model fitted on the other two', () => {
    const rides = climbRides()
    const loo = leaveOneOutAccuracy(rides, MASS)
    expect(loo.nSegments).toBe(scoreAccuracy(rides, MASS, TRUE_MODEL).nSegments)
    expect(loo.segments.length).toBe(loo.nSegments)
    expect(new Set(loo.segments.map((s) => s.activityId))).toEqual(new Set(['a', 'b', 'c']))
    // Noise-free data, so each held-out fit recovers the true bike and the errors vanish.
    expect(loo.mape).toBeCloseTo(0, 6)
    expect(loo.bias).toBeCloseTo(0, 6)
  })

  it('equals pooling per-fold scores from models calibrated directly on the other rides', () => {
    const rides = climbRides().map((r, k) => {
      for (let i = 0; i < r.power.length; i++) {
        r.power[i] = r.power[i]! * (1 + 0.03 * Math.sin(i * 0.37 + k))
      }
      return r
    })
    const reference = rides.flatMap((ride, i) => {
      const others = rides.filter((_r, j) => j !== i)
      return scoreAccuracy([ride], MASS, calibrateBikeModel(others, MASS)).segments
    })
    const loo = leaveOneOutAccuracy(rides, MASS)
    expect(loo.nSegments).toBe(reference.length)
    expect(loo.nSegments).toBeGreaterThan(0)
    reference.forEach((s, k) => {
      const got = loo.segments[k]!
      expect(got.activityId).toBe(s.activityId)
      expect(got.start).toBe(s.start)
      expect(got.end).toBe(s.end)
      expect(got.estimatedW).toBeCloseTo(s.estimatedW, 9)
    })
    expect(loo.mape).toBeGreaterThan(0)
  })

  it('completes 60 rides of 7,200 samples in under 2 seconds', () => {
    const rides = Array.from({ length: 60 }, (_, k) =>
      makeRide(
        `r${k}`,
        wave(7200, 7 + (k % 3), 1, 400 + 5 * k, 0.1 * k),
        wave(7200, 0.03, 0.04, 500 + 7 * k, 0.2 * k),
        TRUE_MODEL,
        MASS,
      ),
    )
    const start = performance.now()
    const loo = leaveOneOutAccuracy(rides, MASS)
    const elapsedMs = performance.now() - start
    expect(loo.nSegments).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(2000)
  })
})

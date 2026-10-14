import { describe, expect, it } from 'vitest'
import type { Curve, CurvePoint, CriticalPowerFit } from '../types'
import { fitCriticalPower, predictCritical } from './criticalPower'

const point = (durationS: number, value: number): CurvePoint => ({
  durationS,
  value,
  activityId: 'a',
  startIndex: 0,
})

const synthetic = (durations: number[], cp: number, wPrime: number): Curve =>
  durations.map((d) => point(d, cp + wPrime / d))

describe('fitCriticalPower', () => {
  it('recovers cp and wPrime exactly from a noise-free curve', () => {
    const curve = synthetic([180, 300, 600, 1200], 250, 20000)
    const fit = fitCriticalPower(curve)
    expect(fit).not.toBeNull()
    expect(fit?.cp).toBeCloseTo(250, 6)
    expect(fit?.wPrime).toBeCloseTo(20000, 4)
    expect(fit?.r2).toBeCloseTo(1, 9)
    expect(fit?.cpSe).toBeCloseTo(0, 6)
    expect(fit?.nPoints).toBe(4)
  })

  it('ignores points outside the default range, non-finite values and non-positive durations', () => {
    const curve = [
      point(5, 999),
      ...synthetic([180, 300, 600, 1200], 250, 20000),
      point(420, NaN),
      point(3600, 1),
    ]
    const fit = fitCriticalPower(curve)
    expect(fit?.nPoints).toBe(4)
    expect(fit?.cp).toBeCloseTo(250, 6)
  })

  it('treats durations at or below zero as unusable when minS allows them', () => {
    const curve = [point(0, 500), ...synthetic([180, 300, 600, 1200], 250, 20000)]
    const fit = fitCriticalPower(curve, { minS: 0 })
    expect(fit?.nPoints).toBe(4)
    expect(fit?.cp).toBeCloseTo(250, 6)
  })

  it('honours custom minS and maxS bounds', () => {
    const curve = synthetic([180, 300, 600, 1200], 250, 20000)
    const fit = fitCriticalPower(curve, { minS: 300 })
    expect(fit?.nPoints).toBe(3)
    expect(fit?.wPrime).toBeCloseTo(20000, 4)
    expect(fitCriticalPower(curve, { minS: 300, maxS: 600 })).toBeNull()
  })

  it('computes the intercept standard error by hand on noisy data', () => {
    // Durations 200, 250, 500, 1000 give x = 1/d = 0.005, 0.004, 0.002, 0.001.
    // Least squares gives cp = 100, wPrime = 10000, SSE = 4, n = 4, meanX = 0.003,
    // Sxx = 1e-5, so cpSe^2 = (4 / 2) * (1 / 4 + 0.003^2 / 1e-5) = 2 * 1.15 = 2.3.
    const curve = [point(200, 151), point(250, 139), point(500, 119), point(1000, 111)]
    const fit = fitCriticalPower(curve)
    expect(fit?.nPoints).toBe(4)
    expect(fit?.cp).toBeCloseTo(100, 6)
    expect(fit?.wPrime).toBeCloseTo(10000, 6)
    expect(fit?.r2).toBeCloseTo(250 / 251, 9)
    expect(fit?.cpSe).toBeCloseTo(Math.sqrt(2.3), 9)
  })

  it('returns wPrime 0 and r2 1 when all values are equal', () => {
    const curve = [point(200, 300), point(400, 300), point(800, 300)]
    const fit = fitCriticalPower(curve)
    expect(fit).toEqual<CriticalPowerFit>({ cp: 300, wPrime: 0, cpSe: 0, r2: 1, nPoints: 3 })
  })

  it('returns null with fewer than 3 usable points', () => {
    expect(fitCriticalPower([point(300, 300), point(600, 280)])).toBeNull()
    const withNaN = [point(300, 300), point(600, 280), point(900, NaN)]
    expect(fitCriticalPower(withNaN)).toBeNull()
    expect(fitCriticalPower([])).toBeNull()
  })

  it('returns null when all points share one duration', () => {
    const curve = [point(300, 250), point(300, 260), point(300, 270)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('returns null when wPrime is negative', () => {
    const curve = [point(200, 100), point(400, 200), point(800, 300)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('returns null when cp is not positive', () => {
    const curve = synthetic([200, 300, 600], -100, 20000)
    expect(fitCriticalPower(curve)).toBeNull()
  })
})

describe('predictCritical', () => {
  it('evaluates cp + wPrime / durationS', () => {
    const fit: CriticalPowerFit = { cp: 250, wPrime: 20000, cpSe: 0, r2: 1, nPoints: 4 }
    expect(predictCritical(fit, 300)).toBeCloseTo(316.6666667, 6)
    expect(predictCritical(fit, 1200)).toBeCloseTo(266.6666667, 6)
    expect(predictCritical(fit, 1e12)).toBeCloseTo(250, 6)
  })
})

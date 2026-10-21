import { describe, expect, it } from 'vitest'
import type { HrPoint } from '../types'
import { crossCheck } from './crossCheck'

function line(slope: number, intercept: number, xs: number[]): HrPoint[] {
  return xs.map((x) => ({
    metabolicPower: x,
    heartRate: intercept + slope * x,
    activityId: 'a',
  }))
}

const X = [1, 2, 3, 4, 5, 6, 7, 8]
const NOISY_X = [0, 1, 2, 3, 4, 5, 6, 7]
const NOISY_Y = [1, 0, 3, 2, 5, 4, 7, 6]

describe('crossCheck', () => {
  it('gives kappa 1.2 for exact run slope 10 and ride slope 12', () => {
    const result = crossCheck(line(10, 2, X), line(12, 3, X))
    expect(result.run?.fit.slope).toBeCloseTo(10, 10)
    expect(result.ride?.fit.slope).toBeCloseTo(12, 10)
    expect(result.kappa).toBeCloseTo(1.2, 10)
    // Exact lines have zero slope error, so only the discrepancy term remains.
    expect(result.lnKappaSe).toBeCloseTo(0.05, 10)
  })

  it('keeps the input points on each sport', () => {
    const runPts = line(10, 2, X)
    const ridePts = line(12, 3, X)
    const result = crossCheck(runPts, ridePts)
    expect(result.run?.points).toEqual(runPts)
    expect(result.ride?.points).toEqual(ridePts)
  })

  it('combines relative slope errors with the discrepancy term', () => {
    // Run slope 19/21 with slopeSe sqrt(160/5292). Ride data is doubled, so kappa = 2 and both
    // relative errors are equal: 2 * (se/slope)^2 = 2 * 160/5292 * (441/361) = 0.0738689.
    // lnKappaSe = sqrt(0.0738689 + 0.05^2) = 0.27635.
    // Each block is its own activity, so the cluster SE stays below OLS and OLS is used.
    const run = NOISY_X.map((x, i) => ({
      metabolicPower: x,
      heartRate: NOISY_Y[i]!,
      activityId: `r${i}`,
    }))
    const ride = NOISY_X.map((x, i) => ({
      metabolicPower: x,
      heartRate: 2 * NOISY_Y[i]!,
      activityId: `d${i}`,
    }))
    const result = crossCheck(run, ride)
    expect(result.kappa).toBeCloseTo(2, 10)
    expect(result.lnKappaSe).toBeCloseTo(0.27635, 4)
    expect(result.lnKappaSe).toBeCloseTo(Math.sqrt(((2 * 160) / 5292) * (441 / 361) + 0.0025), 10)
  })

  it('uses the larger run SE when the run blocks all share one activity', () => {
    // Run slope SE is OLS * sqrt(8), so its relative error is 8 times the OLS value r^2.
    // Ride keeps OLS. lnKappaSe^2 = 8 r^2 + r^2 + 0.05^2 = 9 r^2 + 0.0025, r^2 = 160/5292 * 441/361.
    const run = NOISY_X.map((x, i) => ({
      metabolicPower: x,
      heartRate: NOISY_Y[i]!,
      activityId: 'a',
    }))
    const ride = NOISY_X.map((x, i) => ({
      metabolicPower: x,
      heartRate: 2 * NOISY_Y[i]!,
      activityId: `d${i}`,
    }))
    const result = crossCheck(run, ride)
    expect(result.kappa).toBeCloseTo(2, 10)
    expect(result.lnKappaSe).toBeCloseTo(Math.sqrt((9 * 160 * 441) / (5292 * 361) + 0.0025), 10)
  })

  it('returns null kappa and lnKappaSe when the run sport has too little data', () => {
    const result = crossCheck(line(10, 2, X).slice(0, 7), line(12, 3, X))
    expect(result.run).toBeNull()
    expect(result.ride).not.toBeNull()
    expect(result.kappa).toBeNull()
    expect(result.lnKappaSe).toBeNull()
  })

  it('returns null kappa and lnKappaSe when the ride sport has a non-positive slope', () => {
    const result = crossCheck(line(10, 2, X), line(-12, 3, X))
    expect(result.run).not.toBeNull()
    expect(result.ride).toBeNull()
    expect(result.kappa).toBeNull()
    expect(result.lnKappaSe).toBeNull()
  })

  it('returns all nulls when neither sport has usable data', () => {
    expect(crossCheck([], [])).toEqual({ run: null, ride: null, kappa: null, lnKappaSe: null })
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL, RHO_AIR } from '../constants'
import { airDensity } from '../physics/air'
import { accelerationOf, estimatePower } from './estimatePower'

const MASS = 80

describe('estimatePower', () => {
  it('matches the hand-computed power for a steady 8% climb at 4 m/s', () => {
    // sin = 0.08 / sqrt(1.0064) = 0.079745, cos = 0.996815
    // gravity + rolling = 80 * 9.80665 * (0.079745 + 0.005 * 0.996815) * 4 = 265.890 W
    // aero = 0.5 * 1.225 * 0.32 * 4^3 = 12.544 W
    // (265.890 + 12.544) / 0.975 = 285.575 W
    const speed = new Float64Array(120).fill(4)
    const grade = new Float64Array(120).fill(0.08)
    const p = estimatePower(speed, grade, MASS, DEFAULT_BIKE_MODEL)
    expect(p[60]).toBeCloseTo(285.575, 2)
    expect(p[0]).toBeCloseTo(285.575, 2)
    expect(p[119]).toBeCloseTo(285.575, 2)
  })

  it('matches the hand-computed power for flat riding at 10 m/s', () => {
    // rolling = 80 * 9.80665 * 0.005 * 10 = 39.2266 W
    // aero = 0.5 * 1.225 * 0.32 * 10^3 = 196.0 W
    // (39.2266 + 196.0) / 0.975 = 241.258 W
    const speed = new Float64Array(60).fill(10)
    const grade = new Float64Array(60).fill(0)
    const p = estimatePower(speed, grade, MASS, DEFAULT_BIKE_MODEL)
    for (const x of p) expect(x).toBeCloseTo(241.258, 2)
  })

  it('clamps coasting descents to zero and keeps positive samples', () => {
    const speed = new Float64Array([15, 15, 15])
    const grade = new Float64Array([-0.1, -0.1, 0.08])
    const p = estimatePower(speed, grade, MASS, DEFAULT_BIKE_MODEL)
    expect(p[0]).toBe(0)
    expect(p[1]).toBe(0)
    expect(p[2]).toBeGreaterThan(0)
  })

  it('cuts the aero share of a 20 km climb at 2,000 m by the density ratio', () => {
    // 5 m/s on a 5% climb for 4,000 s is 20 km. Speed is constant, so inertia is zero.
    const n = 4000
    const speed = new Float64Array(n).fill(5)
    const grade = new Float64Array(n).fill(0.05)
    const seaLevel = estimatePower(speed, grade, MASS, DEFAULT_BIKE_MODEL)
    const density = new Float64Array(n).fill(airDensity(2000))
    const high = estimatePower(speed, grade, MASS, DEFAULT_BIKE_MODEL, density)
    const aeroW = (0.5 * RHO_AIR * DEFAULT_BIKE_MODEL.cda * 5 ** 3) / 0.975
    const ratio = airDensity(2000) / RHO_AIR
    expect(seaLevel[0]! - high[0]!).toBeCloseTo(aeroW * (1 - ratio), 9)
    expect((seaLevel[0]! - high[0]!) / seaLevel[0]!).toBeCloseTo(
      (aeroW / seaLevel[0]!) * (1 - ratio),
      9,
    )
  })

  it('adds the inertial term m * a * v using the smoothed acceleration', () => {
    // speed = 5 + 0.1 i, no grade, no resistance: P = m * a * v / efficiency
    const n = 20
    const speed = new Float64Array(n)
    for (let i = 0; i < n; i++) speed[i] = 5 + 0.1 * i
    const grade = new Float64Array(n)
    const p = estimatePower(speed, grade, MASS, { crr: 0, cda: 0 })
    // interior: a = (6.1 - 5.9) / 2 = 0.1, v = 6.0 -> 80 * 0.1 * 6 / 0.975 = 49.2308
    expect(p[10]).toBeCloseTo(49.2308, 3)
    // start: a = 5.15 - 5.10 = 0.05, v = 5.0 -> 80 * 0.05 * 5 / 0.975 = 20.5128
    expect(p[0]).toBeCloseTo(20.5128, 3)
    // end: a = 6.80 - 6.75 = 0.05, v = 6.9 -> 80 * 0.05 * 6.9 / 0.975 = 28.3077
    expect(p[n - 1]).toBeCloseTo(28.3077, 3)
  })

  it('returns NaN where speed or grade is NaN', () => {
    const speed = new Float64Array([10, 10, NaN, 10, 10])
    const grade = new Float64Array([0, NaN, 0, 0, 0])
    const p = estimatePower(speed, grade, MASS, DEFAULT_BIKE_MODEL)
    expect(Number.isNaN(p[1])).toBe(true)
    expect(Number.isNaN(p[2])).toBe(true)
    expect(p[0]).toBeCloseTo(241.258, 2)
    expect(p[4]).toBeCloseTo(241.258, 2)
  })

  it('returns an empty array for empty input', () => {
    const p = estimatePower(new Float64Array(0), new Float64Array(0), MASS, DEFAULT_BIKE_MODEL)
    expect(p.length).toBe(0)
  })
})

describe('accelerationOf', () => {
  it('is zero for a single sample and for constant speed', () => {
    expect(Array.from(accelerationOf(new Float64Array([7])))).toEqual([0])
    expect(Array.from(accelerationOf(new Float64Array(6).fill(3)))).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('is the centred difference inside a ramp and one-sided at the ends', () => {
    // speed = i, so the 5-sample mean is i away from the edges and 1, 1.5, ... near them
    const speed = new Float64Array(20)
    for (let i = 0; i < 20; i++) speed[i] = i
    const a = accelerationOf(speed)
    expect(a[10]).toBeCloseTo(1, 9)
    expect(a[0]).toBeCloseTo(0.5, 9)
    expect(a[19]).toBeCloseTo(0.5, 9)
  })
})

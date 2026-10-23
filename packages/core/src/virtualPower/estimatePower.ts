import { DRIVETRAIN_EFFICIENCY, G, RHO_AIR } from '../constants'
import { rollingMean } from '../math'
import type { BikeModel } from '../types'

const ACCEL_SMOOTHING_SAMPLES = 5

/**
 * Longitudinal acceleration, m/s^2, from speed smoothed with a centred 5-sample mean.
 * Centred difference in the interior, one-sided at the ends.
 */
export function accelerationOf(speed: Float64Array): Float64Array {
  const vs = rollingMean(speed, ACCEL_SMOOTHING_SAMPLES)
  const n = vs.length
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(n - 1, i + 1)
    out[i] = hi === lo ? 0 : (vs[hi]! - vs[lo]!) / (hi - lo)
  }
  return out
}

/**
 * Mechanical power, W, that a rider on a bike with the given drag and rolling
 * resistance must produce to follow speed (m/s) and grade (rise/run).
 * Air density, kg/m^3, is per sample and defaults to sea level.
 * Clamped at zero: coasting downhill produces no estimated power.
 */
export function estimatePower(
  speed: Float64Array,
  grade: Float64Array,
  totalMassKg: number,
  model: BikeModel,
  airDensityKgM3?: Float64Array,
): Float64Array {
  const n = speed.length
  const accel = accelerationOf(speed)
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = speed[i]!
    const g = grade[i]!
    if (Number.isNaN(v) || Number.isNaN(g)) {
      out[i] = NaN
      continue
    }
    const theta = Math.atan(g)
    const rolling = totalMassKg * G * (Math.sin(theta) + model.crr * Math.cos(theta)) * v
    const rho = airDensityKgM3?.[i] ?? RHO_AIR
    const aero = 0.5 * rho * model.cda * v * v * v
    const inertia = totalMassKg * accel[i]! * v
    const p = (rolling + aero + inertia) / DRIVETRAIN_EFFICIENCY
    out[i] = Math.max(0, p)
  }
  return out
}

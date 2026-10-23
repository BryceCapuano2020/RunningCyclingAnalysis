import { DEFAULT_BIKE_MODEL, DRIVETRAIN_EFFICIENCY, G, RHO_AIR } from '../../constants'
import type { CalibrationStats } from '../../virtualPower'
import { accelerationOf } from '../../virtualPower'

/** A ride's per-sample inputs, as the calibration sees them. */
export interface RideInputs {
  speed: Float64Array
  grade: Float64Array
  power: Float64Array
  valid: Uint8Array
  /** Air density, kg/m^3, per sample. Sea level when omitted. */
  airDensity?: Float64Array
}

/** Mass, kg, of the default-model screen in the calibration. */
const SCREEN_MASS_KG = 84

/**
 * Direct least-squares statistics for a ride at a fixed total mass, the way the calibration worked
 * before the digest split. Each 30 s block is regressed with the mass in place, so these are the
 * reference the mass-free sums must reproduce. Blocks are screened the same way as the digest:
 * measured power must be above zero and the default-model estimate at or above zero.
 */
export function referenceRideStats(ride: RideInputs, totalMassKg: number): CalibrationStats {
  const stats: CalibrationStats = { blocks: 0, s11: 0, s12: 0, s22: 0, s1y: 0, s2y: 0 }
  const accel = accelerationOf(ride.speed)
  for (let start = 0; start + 30 <= ride.speed.length; start += 30) {
    let sy = 0
    let s1 = 0
    let s2 = 0
    let usable = true
    for (let i = start; i < start + 30; i++) {
      const v = ride.speed[i]!
      const g = ride.grade[i]!
      const p = ride.power[i]!
      usable =
        ride.valid[i] === 1 &&
        Number.isFinite(v) &&
        v > 2 &&
        Number.isFinite(g) &&
        Number.isFinite(p)
      if (!usable) break
      const theta = Math.atan(g)
      const modelled =
        SCREEN_MASS_KG * G * (Math.sin(theta) + DEFAULT_BIKE_MODEL.crr * Math.cos(theta)) * v +
        SCREEN_MASS_KG * accel[i]! * v +
        0.5 * DEFAULT_BIKE_MODEL.cda * (ride.airDensity?.[i] ?? RHO_AIR) * v * v * v
      usable = p > 0 && modelled >= 0
      if (!usable) break
      sy +=
        p * DRIVETRAIN_EFFICIENCY -
        totalMassKg * G * Math.sin(theta) * v -
        totalMassKg * accel[i]! * v
      s1 += totalMassKg * G * Math.cos(theta) * v
      s2 += 0.5 * (ride.airDensity?.[i] ?? RHO_AIR) * v * v * v
    }
    if (!usable) continue
    const y = sy / 30
    const x1 = s1 / 30
    const x2 = s2 / 30
    if (!(Number.isFinite(y) && Number.isFinite(x1) && Number.isFinite(x2))) continue
    stats.blocks += 1
    stats.s11 += x1 * x1
    stats.s12 += x1 * x2
    stats.s22 += x2 * x2
    stats.s1y += x1 * y
    stats.s2y += x2 * y
  }
  return stats
}

/** Element-wise sum of statistics. */
export function sumReferenceStats(list: CalibrationStats[]): CalibrationStats {
  return list.reduce(
    (acc, s) => ({
      blocks: acc.blocks + s.blocks,
      s11: acc.s11 + s.s11,
      s12: acc.s12 + s.s12,
      s22: acc.s22 + s.s22,
      s1y: acc.s1y + s.s1y,
      s2y: acc.s2y + s.s2y,
    }),
    { blocks: 0, s11: 0, s12: 0, s22: 0, s1y: 0, s2y: 0 },
  )
}

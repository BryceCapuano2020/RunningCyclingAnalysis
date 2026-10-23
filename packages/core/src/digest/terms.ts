import { DRIVETRAIN_EFFICIENCY, G, RHO_AIR } from '../constants'
import type { BikeModel, PowerTerms } from '../types'
import { accelerationOf } from '../virtualPower'

/** Per-sample power terms, one array per field of PowerTerms. */
export interface SampleTerms {
  gravityAccel: Float64Array
  rolling: Float64Array
  aero: Float64Array
}

/**
 * Mass-free power terms at every sample. Mechanical power is (m * (gravityAccel + crr * rolling)
 * + cda * aero) / DRIVETRAIN_EFFICIENCY for total mass m, so these arrays are all a bike model
 * needs. Air density, kg/m^3, is per sample and defaults to sea level.
 */
export function sampleTerms(
  speed: Float64Array,
  grade: Float64Array,
  airDensityKgM3?: Float64Array,
): SampleTerms {
  const n = speed.length
  const accel = accelerationOf(speed)
  const gravityAccel = new Float64Array(n)
  const rolling = new Float64Array(n)
  const aero = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = speed[i]!
    const theta = Math.atan(grade[i]!)
    gravityAccel[i] = (G * Math.sin(theta) + accel[i]!) * v
    rolling[i] = G * Math.cos(theta) * v
    aero[i] = 0.5 * (airDensityKgM3?.[i] ?? RHO_AIR) * v * v * v
  }
  return { gravityAccel, rolling, aero }
}

/** Mean of the terms over samples [start, end). */
export function termsOver(terms: SampleTerms, start: number, end: number): PowerTerms {
  let gravityAccel = 0
  let rolling = 0
  let aero = 0
  for (let i = start; i < end; i++) {
    gravityAccel += terms.gravityAccel[i]!
    rolling += terms.rolling[i]!
    aero += terms.aero[i]!
  }
  const count = end - start
  return { gravityAccel: gravityAccel / count, rolling: rolling / count, aero: aero / count }
}

/**
 * Mass, kg, at which virtual-power climb windows are chosen with DEFAULT_BIKE_MODEL. Fixed, so
 * digests do not depend on the athlete's settings.
 */
export const SELECTION_MASS_KG = 84

/**
 * Mean mechanical power, W, of a stretch with these terms, at total mass massKg.
 *
 * Not clamped at zero per sample, unlike estimatePower, so this is at or below the clamped mean.
 * The gap is about 0.01% on a gentle surge and about 3% at 3 m/s surges with a 20 s period, and
 * grows with surge size. Descents never enter climb windows, so the clamp only matters inside them.
 */
export function powerAt(terms: PowerTerms, massKg: number, model: BikeModel): number {
  const force = massKg * (terms.gravityAccel + model.crr * terms.rolling) + model.cda * terms.aero
  return force / DRIVETRAIN_EFFICIENCY
}

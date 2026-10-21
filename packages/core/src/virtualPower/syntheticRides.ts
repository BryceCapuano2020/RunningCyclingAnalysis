import { estimatePower } from './estimatePower'
import type { BikeModel } from '../types'

/** One ride of 1 Hz samples, as the calibration tests need it. */
export interface SyntheticRide {
  activityId: string
  speed: Float64Array
  grade: Float64Array
  power: Float64Array
  valid: Uint8Array
}

/** Sinusoidal 1 Hz profile: mean + amp * sin(2 pi t / period + phase). */
export function wave(
  n: number,
  mean: number,
  amp: number,
  periodS: number,
  phase: number,
): Float64Array {
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = mean + amp * Math.sin((2 * Math.PI * i) / periodS + phase)
  return out
}

/** A ride whose measured power is what the physics model predicts for the given bike. */
export function makeRide(
  activityId: string,
  speed: Float64Array,
  grade: Float64Array,
  model: BikeModel,
  totalMassKg: number,
): SyntheticRide {
  return {
    activityId,
    speed,
    grade,
    power: estimatePower(speed, grade, totalMassKg, model),
    valid: new Uint8Array(speed.length).fill(1),
  }
}

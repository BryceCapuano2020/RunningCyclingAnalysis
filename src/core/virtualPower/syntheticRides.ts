import type { BikeModel } from '../types'
import type { CalibrationRide } from './calibrate'
import { estimatePower } from './estimatePower'

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
): CalibrationRide {
  return {
    activityId,
    speed,
    grade,
    power: estimatePower(speed, grade, totalMassKg, model),
    valid: new Uint8Array(speed.length).fill(1),
  }
}

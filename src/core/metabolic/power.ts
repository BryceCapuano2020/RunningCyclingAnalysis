import { RESTING_W_PER_KG } from '../constants'

/** Below this speed the runner is treated as standing still. */
const MIN_RUN_SPEED_MS = 0.5
/** The Minetti polynomial is fitted on gradients in [-0.45, 0.45]. */
const MAX_ABS_COST_GRADE = 0.45

/** Minetti et al. 2002 net cost of running, J/kg/m, at a gradient (rise over run). */
export function minettiCost(grade: number): number {
  const g = Math.min(MAX_ABS_COST_GRADE, Math.max(-MAX_ABS_COST_GRADE, grade))
  return ((((155.4 * g - 30.4) * g - 43.3) * g + 46.3) * g + 19.5) * g + 3.6
}

/** Gross metabolic power of running, W/kg, from speed (m/s) and gradient per sample. */
export function runMetabolicPower(
  speed: Float64Array,
  grade: Float64Array,
  economyScale = 1,
): Float64Array {
  const out = new Float64Array(speed.length)
  for (let i = 0; i < speed.length; i++) {
    const v = speed[i]!
    if (Number.isNaN(v)) {
      out[i] = NaN
    } else if (v < MIN_RUN_SPEED_MS) {
      out[i] = RESTING_W_PER_KG
    } else {
      out[i] = RESTING_W_PER_KG + economyScale * minettiCost(grade[i]!) * v
    }
  }
  return out
}

/** Gross metabolic power of cycling, W/kg, from mechanical power in watts. */
export function rideMetabolicPower(
  powerW: Float64Array,
  massKg: number,
  grossEfficiency: number,
): Float64Array {
  const out = new Float64Array(powerW.length)
  const denominator = grossEfficiency * massKg
  for (let i = 0; i < powerW.length; i++) {
    const p = powerW[i]!
    out[i] = Number.isNaN(p) ? NaN : Math.max(RESTING_W_PER_KG, p / denominator)
  }
  return out
}

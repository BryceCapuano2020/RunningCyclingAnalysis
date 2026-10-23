import { MINETTI_FLAT_COST, RESTING_W_PER_KG, RUN_COST_CORRECTION } from '../constants'

/** Below this speed the runner is treated as standing still. */
export const MIN_RUN_SPEED_MS = 0.5
/** The Minetti polynomial is fitted on gradients in [-0.45, 0.45]. */
const MAX_ABS_COST_GRADE = 0.45

/**
 * Minetti et al. 2002 cost of running, J/kg/m, at a gradient (rise over run). Net or gross basis is
 * unverified (docs/validation/physiology.md §2).
 */
export function minettiCost(grade: number): number {
  const g = Math.min(MAX_ABS_COST_GRADE, Math.max(-MAX_ABS_COST_GRADE, grade))
  return ((((155.4 * g - 30.4) * g - 43.3) * g + 46.3) * g + 19.5) * g + MINETTI_FLAT_COST
}

/** Cost of running, J/kg/m, at a gradient: Minetti's curve plus the level correction. */
export function runCost(grade: number): number {
  return minettiCost(grade) + RUN_COST_CORRECTION
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
      out[i] = RESTING_W_PER_KG + economyScale * runCost(grade[i]!) * v
    }
  }
  return out
}

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

/** Descents steeper than this (rise over run) take only part of Minetti's saving: see `descentCost`. */
export const STEEP_DESCENT_GRADE = -0.04
/** The minimum of Minetti's polynomial, -0.1814. Past it the polynomial rises, which would turn the saving back. */
export const DESCENT_COST_FLOOR_GRADE = -0.18
/**
 * The share of Minetti's saving below `STEEP_DESCENT_GRADE` that a run is credited with. Measured oxygen cost on
 * a treadmill saves less on steep descents than the polynomial does, and heart rate at the same effort says the
 * same; docs/validation/physiology.md §11 gives the readings behind this value.
 */
export const STEEP_DESCENT_CREDIT = 0.5

/**
 * Cost of running, J/kg/m, with the saving on a steep descent reduced. At or above -4% it is `runCost`. Below,
 * only `STEEP_DESCENT_CREDIT` of the further saving counts, and the grade is held at -18% past which Minetti's
 * polynomial turns back up. Continuous at -4%, never rising as the descent steepens, and equal to `runCost`
 * for every grade at or above -4%. An unknown (NaN) grade stays NaN, as it does in `runCost`.
 */
export function descentCost(grade: number): number {
  if (grade >= STEEP_DESCENT_GRADE) return runCost(grade)
  const edge = runCost(STEEP_DESCENT_GRADE)
  return edge - STEEP_DESCENT_CREDIT * (edge - runCost(Math.max(grade, DESCENT_COST_FLOOR_GRADE)))
}

/** Options of `runMetabolicPower`. Absent, it is the model of revisions before 7. */
export interface RunPowerOptions {
  /** Revision 7: a steep descent saves less than Minetti's polynomial says (`descentCost`). */
  steepDescent?: boolean
}

/** Gross metabolic power of running, W/kg, from speed (m/s) and gradient per sample. */
export function runMetabolicPower(
  speed: Float64Array,
  grade: Float64Array,
  economyScale = 1,
  options: RunPowerOptions = {},
): Float64Array {
  const cost = options.steepDescent === true ? descentCost : runCost
  const out = new Float64Array(speed.length)
  for (let i = 0; i < speed.length; i++) {
    const v = speed[i]!
    if (Number.isNaN(v)) {
      out[i] = NaN
    } else if (v < MIN_RUN_SPEED_MS) {
      out[i] = RESTING_W_PER_KG
    } else {
      out[i] = RESTING_W_PER_KG + economyScale * cost(grade[i]!) * v
    }
  }
  return out
}

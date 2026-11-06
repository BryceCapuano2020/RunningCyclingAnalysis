/**
 * One set to one estimate, with its error split by whether it averages out over sessions
 * (docs/design/e1rm.md, section 1).
 */
import { exerciseInfo } from './catalog'
import {
  CENTRE_SD_PER_REP,
  CURVE_SD_SCALE,
  DAY_SD,
  REP_CAP,
  RPE_FLOOR,
  RPE_NOISE_BASE,
  RPE_NOISE_PER_RIR,
  RPE_SYSTEMATIC_PER_RIR,
  UNDER_PREDICTION_PER_RIR,
  UNKNOWN_RIR,
  UNKNOWN_RIR_SD,
} from './constants'
import { equationsSpread, logSlope, medianEquation } from './equations'
import type { LiftSet } from './types'

/** The error terms of one set, in log units. */
export interface SetErrorParts {
  /** The lifter's own reps-to-load curve is not the equations' curve. */
  curve: number
  /** Where the population's curve sits is uncertain. */
  centre: number
  /** The three equations disagree. */
  equations: number
  /** The lifter's habit in reading effort. */
  effort: number
  /** RPE noise, different each session. */
  rpeNoise: number
}

export interface SetEstimate {
  /** Reps to failure the set is read as. */
  reps: number
  /** One-rep load, kg. */
  point: number
  /** Systematic error, the same for every session of a lift. */
  sys: number
  /** Independent error, different each session. */
  ind: number
  loadKg: number
  hasRpe: boolean
  deadlift: boolean
  parts: SetErrorParts
}

/** Whether the set can carry an estimate: a working set of a loaded lift. Effort is checked in setEstimate. */
export function isLoadedWorkingSet(set: LiftSet): boolean {
  if (set.warmup || set.reps < 1 || set.loadKg <= 0) return false
  return set.equipment !== 'bodyweight' && !exerciseInfo(set.exercise).bodyweight
}

/** Reps to failure R the set is read as, or null when it is not eligible (not working, not loaded, RPE below 6, R above 15). */
export function repsToFailure(set: LiftSet): number | null {
  if (!isLoadedWorkingSet(set)) return null
  let reps: number
  if (set.rpe === undefined) reps = set.reps + UNKNOWN_RIR
  else if (set.rpe < RPE_FLOOR) return null
  else reps = set.reps + (10 - set.rpe) * (1 + UNDER_PREDICTION_PER_RIR)
  return reps > REP_CAP ? null : reps
}

/** The estimate of one set, or null when it is not eligible. */
export function setEstimate(set: LiftSet): SetEstimate | null {
  const reps = repsToFailure(set)
  if (reps === null) return null
  const hasRpe = set.rpe !== undefined
  const k = set.rpe === undefined ? 0 : 10 - set.rpe
  const effortReps = hasRpe ? RPE_SYSTEMATIC_PER_RIR * k : UNKNOWN_RIR_SD
  const noiseReps = hasRpe ? RPE_NOISE_BASE + RPE_NOISE_PER_RIR * k : 0
  const point = medianEquation(set.loadKg, reps)
  const slope = logSlope(reps)
  const parts: SetErrorParts = {
    curve: CURVE_SD_SCALE * Math.sqrt(reps - 1),
    centre: CENTRE_SD_PER_REP * (reps - 1),
    equations: equationsSpread(reps),
    effort: slope * effortReps,
    rpeNoise: slope * noiseReps,
  }
  const sys = Math.sqrt(
    parts.curve ** 2 + parts.centre ** 2 + parts.equations ** 2 + parts.effort ** 2,
  )
  const ind = Math.hypot(DAY_SD, parts.rpeNoise)
  const deadlift = exerciseInfo(set.exercise).deadliftFamily === true
  return { reps, point, sys, ind, loadKg: set.loadKg, hasRpe, deadlift, parts }
}

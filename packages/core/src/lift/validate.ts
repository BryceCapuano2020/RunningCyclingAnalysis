import {
  LIFT_LOAD_DECIMALS,
  LIFT_LOAD_KG,
  LIFT_REPS,
  LIFT_RPE,
  LIFT_RPE_STEP,
  LIFT_TIME_PATTERN,
} from './limits'
import { isEquipment, isExerciseSlug, isLiftDate, isSetOrder } from './key'
import type { LiftSet } from './types'

const KEYS = new Set([
  'date',
  'time',
  'timePrecision',
  'exercise',
  'equipment',
  'setOrder',
  'reps',
  'loadKg',
  'rpe',
  'warmup',
])

export function isLiftReps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LIFT_REPS.min &&
    value <= LIFT_REPS.max
  )
}

/** Within LIFT_LOAD_KG with at most LIFT_LOAD_DECIMALS decimals. */
export function isLiftLoad(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (value < LIFT_LOAD_KG.min || value > LIFT_LOAD_KG.max) return false
  const scaled = value * 10 ** LIFT_LOAD_DECIMALS
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/** Within LIFT_RPE on LIFT_RPE_STEP. */
export function isLiftRpe(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (value < LIFT_RPE.min || value > LIFT_RPE.max) return false
  return Number.isInteger(value / LIFT_RPE_STEP)
}

/**
 * The set when every field is within its bound, else null. Unknown fields refuse and an optional set to
 * undefined counts as absent, as in the contract's strict schema, so every reader agrees with the API.
 */
export function readLiftSet(value: unknown): LiftSet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some((k) => !KEYS.has(k))) return null
  if (typeof v.date !== 'string' || !isLiftDate(v.date)) return null
  if (typeof v.exercise !== 'string' || !isExerciseSlug(v.exercise)) return null
  if (!isEquipment(v.equipment)) return null
  if (!isSetOrder(v.setOrder) || !isLiftReps(v.reps) || !isLiftLoad(v.loadKg)) return null
  const hasTime = v.time !== undefined
  if (hasTime !== (v.timePrecision !== undefined)) return null
  if (hasTime) {
    if (typeof v.time !== 'string' || !LIFT_TIME_PATTERN.test(v.time)) return null
    if (v.timePrecision !== 'set' && v.timePrecision !== 'session') return null
  }
  if (v.rpe !== undefined && !isLiftRpe(v.rpe)) return null
  if (v.warmup !== undefined && v.warmup !== true) return null
  return {
    date: v.date,
    ...(hasTime && { time: v.time as string, timePrecision: v.timePrecision as 'set' | 'session' }),
    exercise: v.exercise,
    equipment: v.equipment,
    setOrder: v.setOrder,
    reps: v.reps,
    loadKg: v.loadKg,
    ...(v.rpe !== undefined && { rpe: v.rpe as number }),
    ...(v.warmup !== undefined && { warmup: true as const }),
  }
}

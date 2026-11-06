import { isLocalDate } from '../athlete'
import { LIFT_EXERCISE_LENGTH, LIFT_EXERCISE_PATTERN, LIFT_SET_ORDER, LIFT_YEARS } from './limits'
import { EQUIPMENT } from './types'
import type { Equipment, ExerciseKey, LiftSet, LiftSetIdentity } from './types'

/** The set's key, `2026-03-02.back-squat.barbell.3`: date, exercise, equipment, set order. */
export function liftSetKey(set: LiftSetIdentity): string {
  return `${set.date}.${set.exercise}.${set.equipment}.${set.setOrder}`
}

/** The lift a set belongs to, `back-squat.barbell`. */
export function exerciseKeyOf(set: Pick<LiftSet, 'exercise' | 'equipment'>): ExerciseKey {
  return `${set.exercise}.${set.equipment}`
}

/** Whether the text is a date a set may carry: a real date within LIFT_YEARS. */
export function isLiftDate(text: string): boolean {
  if (!isLocalDate(text)) return false
  const year = Number(text.slice(0, 4))
  return year >= LIFT_YEARS.min && year <= LIFT_YEARS.max
}

export function isExerciseSlug(text: string): boolean {
  return (
    text.length >= LIFT_EXERCISE_LENGTH.min &&
    text.length <= LIFT_EXERCISE_LENGTH.max &&
    LIFT_EXERCISE_PATTERN.test(text)
  )
}

export function isSetOrder(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LIFT_SET_ORDER.min &&
    value <= LIFT_SET_ORDER.max
  )
}

export function isEquipment(value: unknown): value is Equipment {
  return typeof value === 'string' && (EQUIPMENT as readonly string[]).includes(value)
}

/** What a key names, or null when the text is not a key a set could have. */
export function parseLiftSetKey(text: string): LiftSetIdentity | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const [date = '', exercise = '', equipment = '', order = ''] = parts
  if (!isLiftDate(date) || !isExerciseSlug(exercise) || !isEquipment(equipment)) return null
  if (!/^[1-9]\d*$/.test(order)) return null
  const setOrder = Number(order)
  if (!isSetOrder(setOrder)) return null
  return { date, exercise, equipment, setOrder }
}

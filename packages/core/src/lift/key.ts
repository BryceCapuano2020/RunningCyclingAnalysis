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

/** Key order: date, exercise, equipment, then set order as a number (`.2` before `.10`). */
export function compareLiftSetKeys(a: string, b: string): number {
  const x = parseLiftSetKey(a)
  const y = parseLiftSetKey(b)
  if (x === null || y === null) return a < b ? -1 : a > b ? 1 : 0
  if (x.date !== y.date) return x.date < y.date ? -1 : 1
  if (x.exercise !== y.exercise) return x.exercise < y.exercise ? -1 : 1
  if (x.equipment !== y.equipment) return x.equipment < y.equipment ? -1 : 1
  return x.setOrder - y.setOrder
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url of ASCII text (a key tuple is always ASCII), without padding. */
function toBase64Url(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 3) {
    const n =
      (text.charCodeAt(i) << 16) |
      ((text.charCodeAt(i + 1) || 0) << 8) |
      (text.charCodeAt(i + 2) || 0)
    const chars = Math.min(3, text.length - i) + 1
    for (let c = 0; c < chars; c++) out += B64[(n >> (18 - 6 * c)) & 63]
  }
  return out
}

function fromBase64Url(text: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  let out = ''
  for (let i = 0; i < text.length; i += 4) {
    const group = text.slice(i, i + 4)
    let n = 0
    for (let c = 0; c < 4; c++)
      n = (n << 6) | (c < group.length ? B64.indexOf(group[c] as string) : 0)
    const bytes = Math.floor((group.length * 6) / 8)
    for (let b = 0; b < bytes; b++) out += String.fromCharCode((n >> (16 - 8 * b)) & 255)
  }
  return out
}

/** The opaque page cursor: base64url of the last key's tuple. */
export function encodeLiftCursor(id: LiftSetIdentity): string {
  return toBase64Url(JSON.stringify([id.date, id.exercise, id.equipment, id.setOrder]))
}

/** The identity a cursor names, or null for anything encodeLiftCursor could not have made. */
export function decodeLiftCursor(text: string): LiftSetIdentity | null {
  const json = fromBase64Url(text)
  if (json === null) return null
  try {
    const tuple: unknown = JSON.parse(json)
    if (!Array.isArray(tuple) || tuple.length !== 4) return null
    const [date, exercise, equipment, setOrder] = tuple
    if (typeof date !== 'string' || typeof exercise !== 'string') return null
    return parseLiftSetKey(`${date}.${exercise}.${String(equipment)}.${String(setOrder)}`)
  } catch {
    return null
  }
}

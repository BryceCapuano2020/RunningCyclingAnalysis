import {
  LIFT_LOAD_KG,
  LIFT_REPS,
  LIFT_RPE_STEP,
  isLiftLoad,
  isLiftReps,
  readLiftSet,
} from '@rca/core/lift'
import type { Equipment, LiftSet } from '@rca/core/lift'
import { kgToLb, lbToKg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/** What the form shows: the typed texts, as the athlete left them. */
export interface SetFormText {
  equipment: Equipment
  reps: string
  load: string
  /** An RPE as text ('8.5'), or '' for not rated. */
  rpe: string
  warmup: boolean
}

export interface SetFormErrors {
  reps?: string
  load?: string
}

/** The RPE choices: not rated, then 6 to 10 in halves. */
export const RPE_CHOICES: readonly number[] = Array.from(
  { length: 9 },
  (_, i) => 6 + i * LIFT_RPE_STEP,
)

const roundKg = (kg: number) => Math.round(kg * 100) / 100

/** A load in kilograms as the profile's unit shows it, without trailing zeros. */
export function loadText(kg: number, units: UnitSystem): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg
  return String(Math.round(value * 100) / 100)
}

/** The athlete's text as kilograms to 0.01, or null when it is not a number. */
export function loadKgFromText(text: string, units: UnitSystem): number | null {
  const clean = text.trim().replace(',', '.')
  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) return null
  const value = Number(clean)
  return roundKg(units === 'imperial' ? lbToKg(value) : value)
}

/** Why the form cannot save, field by field, with the bound; else the set that core accepts. */
export function readSetForm(
  text: SetFormText,
  units: UnitSystem,
  base: Pick<LiftSet, 'date' | 'exercise' | 'setOrder'>,
  loadOptional: boolean,
): { set: LiftSet } | { errors: SetFormErrors } {
  const errors: SetFormErrors = {}
  const reps = /^\d+$/.test(text.reps.trim()) ? Number(text.reps) : NaN
  if (!isLiftReps(reps)) {
    errors.reps = `Enter whole reps from ${LIFT_REPS.min} to ${LIFT_REPS.max}`
  }
  const typedLoad = text.load.trim() === '' && loadOptional ? 0 : loadKgFromText(text.load, units)
  if (typedLoad === null || !isLiftLoad(typedLoad)) {
    const top = units === 'imperial' ? Math.floor(kgToLb(LIFT_LOAD_KG.max)) : LIFT_LOAD_KG.max
    errors.load = `Enter a load from ${LIFT_LOAD_KG.min} to ${top} ${units === 'imperial' ? 'lb' : 'kg'}`
  }
  if (errors.reps || errors.load) return { errors }
  const rpe = text.rpe === '' ? undefined : Number(text.rpe)
  const set = readLiftSet({
    ...base,
    equipment: text.equipment,
    reps,
    loadKg: typedLoad,
    ...(rpe !== undefined && { rpe }),
    ...(text.warmup && { warmup: true }),
  })
  // The fields are checked above; the date, lift or order from the page is what core refused.
  if (!set)
    return { errors: { reps: `Enter whole reps from ${LIFT_REPS.min} to ${LIFT_REPS.max}` } }
  return { set }
}

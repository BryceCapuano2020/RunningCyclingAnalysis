import { formatLoad } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { LiftSetRow } from './liftPageTypes'

/**
 * "100 kg × 5 · RPE 8", with "warm-up" among the parts for a warm-up set, and "Bodyweight × 10" for no added load ("Bodyweight + 20 kg × 15" with some). Each
 * part keeps its words together (no-break spaces, and a word joiner after a hyphen), so a narrow row wraps only between
 * parts, never "RPE" from "8.5" or "warm-" from "up".
 */
export function setText(set: LiftSetRow, equipment: string, units: UnitSystem): string {
  const bodyweight = equipment === 'bodyweight'
  const load =
    bodyweight && set.loadKg === 0
      ? 'Bodyweight'
      : bodyweight
        ? `Bodyweight + ${formatLoad(set.loadKg, units)}`
        : formatLoad(set.loadKg, units)
  const parts = [`${load} × ${set.reps}`]
  if (set.rpe !== undefined) parts.push(`RPE ${set.rpe}`)
  if (set.warmup === true) parts.push('warm-up')
  return parts.map((part) => part.replaceAll(' ', '\u00a0').replaceAll('-', '-\u2060')).join(' · ')
}

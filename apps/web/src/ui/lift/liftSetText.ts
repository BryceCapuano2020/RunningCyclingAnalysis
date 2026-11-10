import { formatLoad } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { LiftSetRow } from './liftPageTypes'

/** "100 kg × 5 · RPE 8", with "warm-up" among the parts for a warm-up set, and "Bodyweight × 10" for no added load. */
export function setText(set: LiftSetRow, equipment: string, units: UnitSystem): string {
  const load =
    set.loadKg === 0 && equipment === 'bodyweight' ? 'Bodyweight' : formatLoad(set.loadKg, units)
  const parts = [`${load} × ${set.reps}`]
  if (set.rpe !== undefined) parts.push(`RPE ${set.rpe}`)
  if (set.warmup === true) parts.push('warm-up')
  return parts.join(' · ')
}

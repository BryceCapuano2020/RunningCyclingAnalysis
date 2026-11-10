import { EXERCISE_CATALOG, LIFT_EXERCISE_LENGTH, exerciseInfo } from '@rca/core/lift'
import type { Equipment } from '@rca/core/lift'

/** One row of the picker: a lift to choose, or the typed name offered as a new lift. */
export interface LiftOption {
  exercise: string
  /** Present for a recent lift: the equipment it was last used with. */
  equipment?: Equipment
  label: string
  isNew?: true
}

/** A lift the athlete used lately, newest first. */
export interface RecentLift {
  exercise: string
  equipment: Equipment
}

/** Lower-case words joined by hyphens, a-z and 0-9 only, at most 48 characters. Empty when nothing is left. */
export function slugify(text: string): string {
  const parts = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return parts.join('-').slice(0, LIFT_EXERCISE_LENGTH.max).replace(/-+$/, '')
}

/** The slug as a name: hyphens to spaces, first letter capital. */
export function deslug(slug: string): string {
  const text = slug.replace(/-/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The catalog's name, else the slug shown back as a name. */
export function liftName(slug: string): string {
  return exerciseInfo(slug).name || deslug(slug)
}

/** "Barbell", for an equipment value. */
export function equipmentName(equipment: Equipment): string {
  return equipment.charAt(0).toUpperCase() + equipment.slice(1)
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Every typed word starts a word of the name, in any order. An empty query matches everything. */
export function matchesName(name: string, query: string): boolean {
  const typed = words(query)
  if (typed.length === 0) return query.trim() === ''
  const have = words(name)
  return typed.every((word) => have.some((candidate) => candidate.startsWith(word)))
}

/**
 * The rows for what is typed: recent lifts first, then the catalog, and when nothing matches the typed
 * name as "Add ‘name’" (only if it makes a valid slug).
 */
export function liftOptions(query: string, recent: readonly RecentLift[]): LiftOption[] {
  const rows: LiftOption[] = []
  const seen = new Set<string>()
  for (const lift of recent) {
    const key = `${lift.exercise}.${lift.equipment}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = liftName(lift.exercise)
    if (!matchesName(name, query)) continue
    rows.push({
      exercise: lift.exercise,
      equipment: lift.equipment,
      label: `${name}, ${lift.equipment}`,
    })
  }
  for (const slug of Object.keys(EXERCISE_CATALOG)) {
    const name = liftName(slug)
    if (matchesName(name, query)) rows.push({ exercise: slug, label: name })
  }
  if (rows.length === 0) {
    const slug = slugify(query)
    if (slug) rows.push({ exercise: slug, label: `Add ‘${deslug(slug)}’`, isNew: true })
  }
  return rows
}

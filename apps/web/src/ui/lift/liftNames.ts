import {
  EQUIPMENT,
  EXERCISE_CATALOG,
  LIFT_EXERCISE_LENGTH,
  exerciseInfo,
  slugify,
  slugifyFull,
} from '@rca/core/lift'
import type { Equipment } from '@rca/core/lift'

/** One row of the picker: a lift to choose, or the typed name offered as a new lift. */
export interface LiftOption {
  exercise: string
  /** Present for a recent lift: the equipment it was last used with. */
  equipment?: Equipment
  label: string
  isNew?: true
}

/** How many used lifts the picker lists before anything is typed. Typing searches every one. */
export const RECENT_LIFTS = 12

/** A lift the athlete used, newest first. */
export interface RecentLift {
  exercise: string
  equipment: Equipment
}

/** Why a typed name cannot become a lift, or null when it can (or nothing is typed). */
export function nameProblem(text: string): string | null {
  if (text.trim() === '') return null
  const slug = slugifyFull(text)
  if (slug === '') return 'Use letters or numbers in the name'
  if (slug.length > LIFT_EXERCISE_LENGTH.max)
    return `Use a name of ${LIFT_EXERCISE_LENGTH.max} characters or fewer`
  return null
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

const EQUIPMENT_WORDS: ReadonlySet<string> = new Set(EQUIPMENT)

/**
 * The rows for what is typed. With nothing typed, the 12 lifts used last lead and the catalog follows. Typed, catalog
 * names match first, then every lift used, matched with its equipment ("curl cable"), then catalog names found by
 * leaving out an equipment word ("bench press dumbbell"), one such word picking that equipment. When nothing matches,
 * the last option is "Add ‘name’", unless the name cannot become a valid slug.
 */
export function liftOptions(query: string, recent: readonly RecentLift[]): LiftOption[] {
  const typed = query.trim() !== ''
  const recentRows: LiftOption[] = []
  const seen = new Set<string>()
  for (const lift of recent) {
    if (!typed && recentRows.length === RECENT_LIFTS) break
    const key = `${lift.exercise}.${lift.equipment}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = liftName(lift.exercise)
    if (!matchesName(`${name} ${lift.equipment}`, query)) continue
    recentRows.push({
      exercise: lift.exercise,
      equipment: lift.equipment,
      label: `${name}, ${lift.equipment}`,
    })
  }
  const all = words(query)
  const named = all.filter((word) => !EQUIPMENT_WORDS.has(word))
  const gear = all.filter((word) => EQUIPMENT_WORDS.has(word)) as Equipment[]
  const withGear = named.length > 0 && named.length < all.length
  const listed = new Set(recentRows.map((row) => `${row.exercise}.${row.equipment}`))
  const catalogRows: LiftOption[] = []
  const gearRows: LiftOption[] = []
  for (const slug of Object.keys(EXERCISE_CATALOG)) {
    const name = liftName(slug)
    if (matchesName(name, query)) catalogRows.push({ exercise: slug, label: name })
    else if (withGear && matchesName(name, named.join(' '))) {
      const equipment = gear.length === 1 ? gear[0] : undefined
      if (equipment && listed.has(`${slug}.${equipment}`)) continue
      gearRows.push(
        equipment
          ? { exercise: slug, equipment, label: `${name}, ${equipment}` }
          : { exercise: slug, label: name },
      )
    }
  }
  // An exact name leads, then names that start with what is typed: "curl" picks Curl, not Leg curl.
  const wanted = query.trim().toLowerCase()
  const rank = (row: LiftOption) => {
    const name = liftName(row.exercise).toLowerCase()
    return name === wanted ? 0 : name.startsWith(wanted) ? 1 : 2
  }
  catalogRows.sort((a, b) => rank(a) - rank(b))
  const rows = typed
    ? [...catalogRows, ...recentRows, ...gearRows]
    : [...recentRows, ...catalogRows]
  if (rows.length === 0 && nameProblem(query) === null) {
    const slug = slugify(query)
    if (slug !== null) rows.push({ exercise: slug, label: `Add ‘${liftName(slug)}’`, isNew: true })
  }
  return rows
}

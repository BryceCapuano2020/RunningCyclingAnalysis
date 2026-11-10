import { EXERCISE_CATALOG, exerciseInfo } from '../catalog'
import { LIFT_EXERCISE_LENGTH } from '../limits'
import type { Equipment } from '../types'

/**
 * A slug from free text: lower case, accents dropped, every other run of characters a single hyphen,
 * cut to the slug length. Null when nothing is left. The web logger's custom slugs should import this,
 * so a typed name and an imported one land on the same lift.
 */
export function slugify(name: string): string | null {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, LIFT_EXERCISE_LENGTH.max)
    .replace(/-+$/, '')
  return slug === '' ? null : slug
}

/** Hevy's equipment names, normalised, to ours. Any other name is `other`. */
const EQUIPMENT_NAMES: Readonly<Record<string, Equipment>> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  'smith machine': 'smith',
  cable: 'cable',
  kettlebell: 'kettlebell',
  bodyweight: 'bodyweight',
  'body weight': 'bodyweight',
}

type SlugRule = string | { dumbbell: string; otherwise: string }

/** Hevy base names (normalised) that differ from their catalog slug's words. Others go through slugify. */
const HEVY_NAMES: Readonly<Record<string, SlugRule>> = {
  squat: 'back-squat',
  'shoulder press': 'overhead-press',
  'bent over row': { dumbbell: 'dumbbell-row', otherwise: 'barbell-row' },
  'seated row': 'cable-row',
  'seated cable row': 'cable-row',
  'triceps dip': 'dip',
  'lying leg curl': 'leg-curl',
  'seated leg curl': 'leg-curl',
  'standing calf raise': 'calf-raise',
  'seated calf raise': 'calf-raise',
  'bicep curl': 'curl',
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** What a Hevy exercise title names, and whether the slug is the athlete's own rather than the catalog's. */
export interface HevyExercise {
  exercise: string
  equipment: Equipment
  custom: boolean
}

const SUFFIX = /^(.*?)\s*\(([^()]*)\)\s*$/

/**
 * Splits "Bench Press (Barbell)" into the name and its equipment and maps both. A title with no suffix
 * is bodyweight when the catalog says the lift is, else other. A name the table does not know becomes
 * its slugify slug; that is custom unless the catalog already holds the slug. Null when the title has
 * no letters or digits to make a slug from.
 */
export function mapHevyExercise(title: string): HevyExercise | null {
  const suffix = SUFFIX.exec(title.trim())
  const base = suffix === null ? title.trim() : (suffix[1] as string)
  const named = suffix === null ? undefined : EQUIPMENT_NAMES[normalise(suffix[2] as string)]
  const equipment: Equipment | null = suffix === null ? null : (named ?? 'other')
  const rule = HEVY_NAMES[normalise(base)]
  let slug: string | null
  if (rule === undefined) slug = slugify(base)
  else
    slug =
      typeof rule === 'string' ? rule : equipment === 'dumbbell' ? rule.dumbbell : rule.otherwise
  if (slug === null) return null
  const known = Object.hasOwn(EXERCISE_CATALOG, slug)
  return {
    exercise: slug,
    equipment: equipment ?? (exerciseInfo(slug).bodyweight === true ? 'bodyweight' : 'other'),
    custom: !known,
  }
}

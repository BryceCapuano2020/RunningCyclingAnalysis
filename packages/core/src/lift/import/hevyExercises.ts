import { ASSISTED_PREFIX, EXERCISE_CATALOG, exerciseInfo } from '../catalog'
import { slugify } from '../slug'
import type { Equipment } from '../types'

/** Hevy's equipment names, normalised, to ours. Any other name is `other`. */
const EQUIPMENT_NAMES: Readonly<Record<string, Equipment>> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  'smith machine': 'smith',
  'pec deck': 'machine',
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
  'triceps dip': 'dip',
  'lying leg curl': 'leg-curl',
  'seated leg curl': 'leg-curl',
  'standing calf raise': 'standing-calf-raise',
  'seated calf raise': 'seated-calf-raise',
  'seated overhead press': {
    dumbbell: 'seated-dumbbell-shoulder-press',
    otherwise: 'overhead-press',
  },
  'incline curl': 'incline-dumbbell-curl',
  butterfly: 'pec-deck-fly',
  'rear delt reverse fly': 'reverse-pec-deck',
  'triceps pushdown': 'triceps-pressdown',
  'triceps rope pushdown': 'triceps-pressdown',
  'chest supported incline row': 'chest-supported-row',
  hyperextension: 'back-extension',
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
  // An assisted lift is not the plain lift: its load is the help, so it gets a slug of its own.
  if (suffix !== null && normalise(suffix[2] as string) === 'assisted')
    slug = slugify(`${ASSISTED_PREFIX}${base}`)
  else if (rule === undefined) slug = slugify(base)
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

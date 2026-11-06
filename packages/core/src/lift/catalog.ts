export type LiftRegion = 'lower' | 'upper' | 'other'

export interface ExerciseInfo {
  name: string
  region: LiftRegion
  /** Pulls from the floor: its load is not comparable with a squat's or a press's. */
  deadliftFamily?: true
  /** Moves body weight; the logged load is only what is added. */
  bodyweight?: true
  /** Its dumbbell form uses two dumbbells, so weekly volume counts both (a dumbbell load is one). */
  pair?: true
}

/** Common lifts by slug. An exercise not listed is still valid; it just has region other. */
export const EXERCISE_CATALOG: Readonly<Record<string, ExerciseInfo>> = {
  'back-squat': { name: 'Back squat', region: 'lower' },
  'front-squat': { name: 'Front squat', region: 'lower' },
  'box-squat': { name: 'Box squat', region: 'lower' },
  'goblet-squat': { name: 'Goblet squat', region: 'lower' },
  'bench-press': { name: 'Bench press', region: 'upper', pair: true },
  'incline-bench-press': { name: 'Incline bench press', region: 'upper', pair: true },
  'close-grip-bench-press': { name: 'Close-grip bench press', region: 'upper' },
  deadlift: { name: 'Deadlift', region: 'lower', deadliftFamily: true },
  'sumo-deadlift': { name: 'Sumo deadlift', region: 'lower', deadliftFamily: true },
  'romanian-deadlift': { name: 'Romanian deadlift', region: 'lower', deadliftFamily: true },
  'overhead-press': { name: 'Overhead press', region: 'upper', pair: true },
  'barbell-row': { name: 'Barbell row', region: 'upper' },
  'dumbbell-row': { name: 'Dumbbell row', region: 'upper', pair: true },
  'cable-row': { name: 'Cable row', region: 'upper' },
  'pull-up': { name: 'Pull-up', region: 'upper', bodyweight: true },
  'chin-up': { name: 'Chin-up', region: 'upper', bodyweight: true },
  dip: { name: 'Dip', region: 'upper', bodyweight: true },
  'push-up': { name: 'Push-up', region: 'upper', bodyweight: true },
  'hip-thrust': { name: 'Hip thrust', region: 'lower' },
  'leg-press': { name: 'Leg press', region: 'lower' },
  lunge: { name: 'Lunge', region: 'lower', pair: true },
  'split-squat': { name: 'Split squat', region: 'lower', pair: true },
  'bulgarian-split-squat': { name: 'Bulgarian split squat', region: 'lower', pair: true },
  'leg-curl': { name: 'Leg curl', region: 'lower' },
  'leg-extension': { name: 'Leg extension', region: 'lower' },
  'calf-raise': { name: 'Calf raise', region: 'lower' },
  curl: { name: 'Curl', region: 'upper', pair: true },
  'triceps-extension': { name: 'Triceps extension', region: 'upper', pair: true },
  'lateral-raise': { name: 'Lateral raise', region: 'upper', pair: true },
  'lat-pulldown': { name: 'Lat pulldown', region: 'upper' },
}

const OTHER: ExerciseInfo = { name: '', region: 'other' }

/** What the catalog knows of a slug; an unknown slug has region other and no name. */
export function exerciseInfo(slug: string): ExerciseInfo {
  return Object.hasOwn(EXERCISE_CATALOG, slug) ? (EXERCISE_CATALOG[slug] ?? OTHER) : OTHER
}

export type LiftRegion = 'lower' | 'upper' | 'other'

export interface ExerciseInfo {
  name: string
  region: LiftRegion
  /** Pulls from the floor: its load is not comparable with a squat's or a press's. */
  deadliftFamily?: true
  /** Moves body weight; the logged load is only what is added. */
  bodyweight?: true
  /** Its logged load is the help taken off, not a load lifted: no estimate, best or volume. */
  assisted?: true
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
  // Added in LIFT_REVISION 3. Trunk work (abs, obliques, lower-back extensors) is region other: it is
  // neither upper nor lower load. Slugs are slugify(name) so a custom lift typed with the name joins the entry.
  'seated-dumbbell-shoulder-press': {
    name: 'Seated dumbbell shoulder press',
    region: 'upper',
    pair: true,
  },
  'arnold-press': { name: 'Arnold press', region: 'upper', pair: true },
  skullcrusher: { name: 'Skullcrusher', region: 'upper', pair: true },
  'incline-dumbbell-curl': { name: 'Incline dumbbell curl', region: 'upper', pair: true },
  'preacher-curl': { name: 'Preacher curl', region: 'upper' },
  'hammer-curl': { name: 'Hammer curl', region: 'upper', pair: true },
  'face-pull': { name: 'Face pull', region: 'upper' },
  'pec-deck-fly': { name: 'Pec deck fly', region: 'upper' },
  'reverse-pec-deck': { name: 'Reverse pec deck', region: 'upper' },
  'chest-fly': { name: 'Chest fly', region: 'upper', pair: true },
  'triceps-pressdown': { name: 'Triceps pressdown', region: 'upper' },
  'overhead-cable-triceps-extension': { name: 'Overhead cable triceps extension', region: 'upper' },
  'chest-supported-row': { name: 'Chest-supported row', region: 'upper', pair: true },
  'single-arm-machine-row': { name: 'Single-arm machine row', region: 'upper' },
  't-bar-row': { name: 'T-bar row', region: 'upper' },
  'straight-arm-pulldown': { name: 'Straight-arm pulldown', region: 'upper' },
  shrug: { name: 'Shrug', region: 'upper', pair: true },
  'rear-delt-fly': { name: 'Rear delt fly', region: 'upper', pair: true },
  'machine-chest-press': { name: 'Machine chest press', region: 'upper' },
  'machine-shoulder-press': { name: 'Machine shoulder press', region: 'upper' },
  'inverted-row': { name: 'Inverted row', region: 'upper', bodyweight: true },
  'single-leg-press': { name: 'Single-leg press', region: 'lower' },
  'hack-squat': { name: 'Hack squat', region: 'lower' },
  'step-up': { name: 'Step-up', region: 'lower', pair: true },
  'walking-lunge': { name: 'Walking lunge', region: 'lower', pair: true },
  'reverse-lunge': { name: 'Reverse lunge', region: 'lower', pair: true },
  'good-morning': { name: 'Good morning', region: 'lower' },
  'stiff-leg-deadlift': { name: 'Stiff-leg deadlift', region: 'lower', deadliftFamily: true },
  'trap-bar-deadlift': { name: 'Trap bar deadlift', region: 'lower', deadliftFamily: true },
  'hip-abduction': { name: 'Hip abduction', region: 'lower' },
  'hip-adduction': { name: 'Hip adduction', region: 'lower' },
  'glute-bridge': { name: 'Glute bridge', region: 'lower' },
  'nordic-curl': { name: 'Nordic curl', region: 'lower', bodyweight: true },
  'standing-calf-raise': { name: 'Standing calf raise', region: 'lower' },
  'seated-calf-raise': { name: 'Seated calf raise', region: 'lower' },
  'back-extension': { name: 'Back extension', region: 'other', bodyweight: true },
  'ab-wheel': { name: 'Ab wheel', region: 'other', bodyweight: true },
  'hanging-leg-raise': { name: 'Hanging leg raise', region: 'other', bodyweight: true },
  crunch: { name: 'Crunch', region: 'other', bodyweight: true },
  'cable-crunch': { name: 'Cable crunch', region: 'other' },
  'sit-up': { name: 'Sit-up', region: 'other', bodyweight: true },
  'russian-twist': { name: 'Russian twist', region: 'other' },
  'pallof-press': { name: 'Pallof press', region: 'other' },
}

const OTHER: ExerciseInfo = { name: '', region: 'other' }
const ASSISTED: ExerciseInfo = { name: '', region: 'other', bodyweight: true, assisted: true }

/** The slug an import gives an assisted lift (`assisted-pull-up`); see mapHevyExercise. */
export const ASSISTED_PREFIX = 'assisted-'

/** What the catalog knows of a slug; an unknown slug has region other and no name. */
export function exerciseInfo(slug: string): ExerciseInfo {
  if (Object.hasOwn(EXERCISE_CATALOG, slug)) return EXERCISE_CATALOG[slug] ?? OTHER
  return slug.startsWith(ASSISTED_PREFIX) ? ASSISTED : OTHER
}

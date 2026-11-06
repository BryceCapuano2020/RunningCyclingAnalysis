/** How a lift is loaded. A lift is exercise plus equipment: a barbell and a smith back squat are two lifts. */
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'smith',
  'cable',
  'kettlebell',
  'bodyweight',
  'other',
] as const
export type Equipment = (typeof EQUIPMENT)[number]

/** Whether `time` is when the set was done or only when the session started. */
export type TimePrecision = 'set' | 'session'

/**
 * One logged set. Raw values only: e1RM is computed on read. No free text is kept. `time` and
 * `timePrecision` are present together or not at all.
 */
export interface LiftSet {
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Local time, HH:MM. */
  time?: string
  timePrecision?: TimePrecision
  /** Slug from the catalog, or one the athlete typed. */
  exercise: string
  equipment: Equipment
  /** Position within the date and lift, from 1. */
  setOrder: number
  reps: number
  /** Kilograms. Added load for bodyweight; one dumbbell for dumbbell. */
  loadKg: number
  /** Reported effort, 1 to 10 in halves. */
  rpe?: number
  /** True for a warm-up set; absent means a working set. */
  warmup?: true
}

/** The lift a set belongs to: `<exercise>.<equipment>`. */
export type ExerciseKey = `${string}.${Equipment}`

/** What a set key names: one set's place in the log. */
export interface LiftSetIdentity {
  date: string
  exercise: string
  equipment: Equipment
  setOrder: number
}

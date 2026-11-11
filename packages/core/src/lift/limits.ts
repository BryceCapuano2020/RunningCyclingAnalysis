/** Reps in one set. A set of 100 is already a typing slip for any estimator. */
export const LIFT_REPS = { min: 1, max: 100 } as const

/** Kilograms on the bar (or one dumbbell, or added to body weight). Above a tonne is a slip. */
export const LIFT_LOAD_KG = { min: 0, max: 1000 } as const

/** Decimal places a load keeps: 2.5 lb plates convert to kg with two. */
export const LIFT_LOAD_DECIMALS = 2

/** Reported effort, in steps of LIFT_RPE_STEP. */
export const LIFT_RPE = { min: 1, max: 10 } as const
export const LIFT_RPE_STEP = 0.5

/**
 * Position of a set within its date and lift, counted across every session of that lift on the day.
 * Far above any real day.
 */
export const LIFT_SET_ORDER = { min: 1, max: 200 } as const

/** Exercise slug: lower-case words joined by single hyphens. */
export const LIFT_EXERCISE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const LIFT_EXERCISE_LENGTH = { min: 1, max: 48 } as const

/** Local time of day, 00:00 to 23:59. */
export const LIFT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The years a set may be dated in. Same range as dated settings (MEASUREMENT_YEARS in the contract,
 * pinned equal by a test), kept here because core cannot import the contract.
 */
export const LIFT_YEARS = { min: 1970, max: 2100 } as const

/** Sets one account keeps: about nine years of a heavy lifter's logging. Same as the contract's (pinned equal by a test there). */
export const MAX_LIFT_SETS_PER_USER = 60_000

/** A Hevy workouts CSV: years of logging are a few MB, so past this is not a Hevy export. */
export const MAX_HEVY_FILE_BYTES = 8 * 1024 * 1024

/** Sets in one write: a long session in one request, small enough for one D1 batch. */
export const MAX_LIFT_SETS_PER_WRITE = 500

/** Keys in one delete: matches the write size so a write can always be undone in one request. */
export const MAX_LIFT_KEYS_PER_DELETE = 500

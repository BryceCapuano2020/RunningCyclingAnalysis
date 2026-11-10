import {
  AGE_RANGE,
  CHANGE_Z,
  DEADLIFT_EXTRA_HIGH,
  GRADE_CEILING,
  HALF_LIFE_DAYS,
  LIFT_STANDARDS_SOURCE,
  LOMBARDI_EXPONENT,
  MASS_RANGE_KG,
  REP_CAP,
  RPE_FLOOR,
  UNDER_PREDICTION_PER_RIR,
  UNKNOWN_RIR,
  WARMUP_SET_SECONDS,
  WINDOW_DAYS,
  WORKING_SET_SECONDS,
  WORLD_SHARE,
  Z_HIGH,
  Z_LOW,
} from '@rca/core/lift'
import { formatDuration } from '@rca/core/units'

const percent = (share: number) => `${Math.round(share * 100)}%`

/** The projected one-rep max, the big three total and lifting time, every number from core (docs/design/e1rm.md). */
export const LIFT_LEAD = 'Each lift’s one-rep max is projected from your working sets.'

export const LIFT_FACTS: readonly string[] = [
  `A set’s estimate is the middle of Epley, Brzycki and Lombardi (reps to the power ${LOMBARDI_EXPONENT}).`,
  `Reps to failure add ${1 + UNDER_PREDICTION_PER_RIR} per rep in reserve from your RPE, or ${UNKNOWN_RIR} without one.`,
  `Sets under RPE ${RPE_FLOOR} or over ${REP_CAP} reps to failure, warm-ups and bodyweight lifts are not read.`,
  `Each lift reads the ${WINDOW_DAYS} days to its latest session, and a session’s weight halves every ${HALF_LIFE_DAYS} days.`,
  `The 80% range runs ${Z_LOW} standard errors below and ${Z_HIGH} above, ${percent(DEADLIFT_EXTRA_HIGH)} more on top for a deadlift.`,
  'It never drops below your heaviest working set in the window.',
  `Change compares the last ${WINDOW_DAYS / 7} weeks with the ${WINDOW_DAYS / 7} before, and is called past ${CHANGE_Z} standard errors.`,
  'The big three total adds squat, bench press and deadlift, or shows the heaviest when one is missing.',
  `Activities counts ${formatDuration(WORKING_SET_SECONDS)} per working set and ${formatDuration(WARMUP_SET_SECONDS)} per warm-up, rest included, as lifts store no duration.`,
]

/** The lift age grade, with its standard's source and ranges from core (docs/design/lift-grade.md). */
export const LIFT_GRADE_LEAD =
  'A lift’s grade is its projected one-rep max as a share of world class for your age, sex and body weight.'

export const LIFT_GRADE_FACTS: readonly string[] = [
  `Squat, bench press and deadlift are graded on ${LIFT_STANDARDS_SOURCE.cardName} raw results, with the 99.9th percentile lifter at ${percent(WORLD_SHARE)}.`,
  `It covers ages ${AGE_RANGE[0]} to ${AGE_RANGE[1]}, and ${MASS_RANGE_KG.male[0]} to ${MASS_RANGE_KG.male[1]} kg for men, ${MASS_RANGE_KG.female[0]} to ${MASS_RANGE_KG.female[1]} kg for women.`,
  `Grades stop at 100%, and over ${percent(GRADE_CEILING)} of the standard is not graded.`,
  'The lift corner on Balance is the big three’s maxes over the sum of their standards.',
]

export const LIFT_STANDARDS_CREDIT: string = LIFT_STANDARDS_SOURCE.attribution

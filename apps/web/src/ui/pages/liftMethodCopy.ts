import {
  CHANGE_Z,
  DEADLIFT_EXTRA_HIGH,
  HALF_LIFE_DAYS,
  LOMBARDI_EXPONENT,
  REP_CAP,
  RPE_FLOOR,
  UNDER_PREDICTION_PER_RIR,
  UNKNOWN_RIR,
  WINDOW_DAYS,
  Z_HIGH,
  Z_LOW,
  LIFT_STANDARDS_SOURCE,
  WORLD_SHARE,
} from '@rca/core/lift'

/** The method of the estimated one-rep max, every number quoted from core (docs/design/e1rm.md). One fact a line. */
export const ONE_REP_MAX_LINES: readonly string[] = [
  'Each set becomes a one-rep max with three equations: Epley, Brzycki and Lombardi.',
  'The middle of the three is the set’s estimate.',
  `Lombardi raises the reps to the power ${LOMBARDI_EXPONENT}.`,
  `With an RPE, reps to failure are the reps plus ${1 + UNDER_PREDICTION_PER_RIR} for each rep in reserve.`,
  `With no RPE, reps to failure are the reps plus ${UNKNOWN_RIR}.`,
  `A set rated below RPE ${RPE_FLOOR} is not read.`,
  `A set more than ${REP_CAP} reps from failure is not read.`,
  'A warm-up, a bodyweight lift and a lift with no eligible set have no estimate.',
  `A lift’s estimate uses the ${WINDOW_DAYS} days to its latest session.`,
  `A session’s weight halves every ${HALF_LIFE_DAYS} days.`,
]

export const ONE_REP_MAX_RANGE_LINES: readonly string[] = [
  'The range is an 80% range for the underlying max, not for one day’s test.',
  `It reaches ${Z_LOW} standard errors below the estimate and ${Z_HIGH} above.`,
  `The top of a deadlift’s range is ${Math.round(DEADLIFT_EXTRA_HIGH * 100)}% wider: the equations read deadlifts low.`,
  'The floor is the heaviest working set in the window. It was lifted, so it has no range.',
  'Times body mass is the estimate over the body weight in effect on its date.',
  `Change compares the ${WINDOW_DAYS / 7} weeks to the latest session with the ${WINDOW_DAYS / 7} weeks before.`,
  `It says up or down only when the two differ by more than ${CHANGE_Z} standard errors of the error they do not share.`,
  'Otherwise it says no clear change.',
]

/** The method of the lift age grade, with the standard's source and the anchor from core (docs/design/lift-grade.md). */
export const LIFT_GRADE_LINES: readonly string[] = [
  'A lift’s grade is its estimated one-rep max as a share of the standard for your age, sex and body weight.',
  'Squat, bench press and deadlift are graded.',
  `The standard is fitted to ${LIFT_STANDARDS_SOURCE.shortName}, raw lifts.`,
  `The 99.9th percentile of lifters at your age, sex and weight is set at ${Math.round(WORLD_SHARE * 100)}%, world class.`,
  'The grade has a range that carries the estimate’s range and the standard’s own error.',
]

export const LIFT_STANDARDS_CREDIT: string = LIFT_STANDARDS_SOURCE.attribution

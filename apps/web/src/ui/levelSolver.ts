import { FIRST_GRADED_DISTANCE_M, LAST_GRADED_DISTANCE_M, ageGradeForEffort } from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { equivalenceFor } from '@rca/core/digest'
import type { HrCalibration, Sport } from '@rca/core/types'

/**
 * The athlete an inverse is for: the age and sex the lower sport was graded at, the body mass, and the
 * library's heart-rate calibration, which the page's ride equivalence weighs its draws by.
 */
export interface TargetAthlete {
  age: number
  sex: Sex
  massKg: number
  calibration: HrCalibration | null
}

/** Bisection steps over a flat speed, which costs no equivalence: each halves the bracket. */
const SPEED_STEPS = 25
/**
 * A watts search stops once its estimate moves by less than this. Each evaluation of the equivalence costs
 * about a millisecond, so the search converges in a few of them, to far below the 5 W steps.
 */
const WATTS_TOLERANCE = 1e-3
const MAX_SECANTS = 40
/** The range's ends are searched within this fraction either side of the centre. */
const END_SPAN = 0.15
/** The first power tried when a ride's watts are bracketed, and how many times it doubles to reach a speed. */
const FIRST_WATTS = 100
const MAX_DOUBLINGS = 16
/**
 * The flat speed, m/s, at which holding it for durationS grades at the target. Speed raises the
 * distance covered, so the grade rises with it and bisection finds the one speed. Null when no
 * speed within the standards' distances reaches the target.
 */
function runSpeedAtGrade(grade: number, durationS: number, athlete: TargetAthlete): number | null {
  const gradeAt = (speedMs: number) =>
    ageGradeForEffort(speedMs, durationS, athlete.age, athlete.sex) ?? Number.NaN
  let lo = FIRST_GRADED_DISTANCE_M / durationS
  let hi = LAST_GRADED_DISTANCE_M / durationS
  if (!(gradeAt(lo) <= grade && grade <= gradeAt(hi))) return null
  for (let step = 0; step < SPEED_STEPS; step++) {
    const mid = (lo + hi) / 2
    if (gradeAt(mid) < grade) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** A value as a low, centre and high: a run's one pace is all three, and a ride's range is the equivalence's ends. */
export interface NativeRange {
  low: number
  centre: number
  high: number
}

/**
 * The power at which `at` reaches the speed, between lo and hi. `at` rises with power and is close to
 * linear over a range of power, so the search is Illinois false position: it keeps a bracket and
 * converges in a few evaluations. Null when the bracket does not hold the speed.
 */
function crossingPower(
  speedMs: number,
  at: (watts: number) => number,
  lo: number,
  hi: number,
): number | null {
  let fLo = at(lo) - speedMs
  let fHi = at(hi) - speedMs
  if (!(fLo < 0 && fHi >= 0)) return null
  let estimate = lo
  let lastMoved = 0
  for (let step = 0; step < MAX_SECANTS; step++) {
    const next = (lo * fHi - hi * fLo) / (fHi - fLo)
    const fNext = at(next) - speedMs
    if (fNext === 0 || Math.abs(next - estimate) < WATTS_TOLERANCE) return next
    estimate = next
    if (fNext < 0) {
      lo = next
      fLo = fNext
      if (lastMoved === -1) fHi /= 2
      lastMoved = -1
    } else {
      hi = next
      fHi = fNext
      if (lastMoved === 1) fLo /= 2
      lastMoved = 1
    }
  }
  return estimate
}

/** The power at which `at` reaches the speed, found by doubling the power until it does, then searching. */
function searchPower(speedMs: number, at: (watts: number) => number): number | null {
  let hi = FIRST_WATTS
  for (let i = 0; i < MAX_DOUBLINGS && at(hi) < speedMs; i++) hi *= 2
  return crossingPower(speedMs, at, 0, hi)
}

/**
 * The power at one end of the range, searched near the centre, with a full search when the end lies
 * outside that bracket.
 */
function endPower(speedMs: number, at: (watts: number) => number, centre: number): number | null {
  const near = crossingPower(speedMs, at, centre * (1 - END_SPAN), centre * (1 + END_SPAN))
  return near ?? searchPower(speedMs, at)
}

/**
 * The watts whose page equivalent is the target speed, at its centre (the p50 the ride's grade is read
 * from) and at each end of its range. The equivalence's ends are ordered, so the watts that reach the
 * speed at the 95th percentile are the fewest, and at the 5th percentile the most. Null when the centre
 * cannot be found, or an end cannot be bracketed around it.
 */
function wattsRangeAtSpeed(speedMs: number, athlete: TargetAthlete): NativeRange | null {
  // Built once: the draws and the heart-rate weights do not change with the watts searched.
  const equivalence = equivalenceFor(athlete.calibration)
  const endAt = (end: 'p05' | 'p50' | 'p95') => (watts: number) =>
    equivalence(watts, athlete.massKg)[end]
  const centre = searchPower(speedMs, endAt('p50'))
  if (centre === null) return null
  const low = endPower(speedMs, endAt('p95'), centre)
  const high = endPower(speedMs, endAt('p05'), centre)
  return low === null || high === null ? null : { low, centre, high }
}

/**
 * The sport's own figures that grade at the target, for each sport: the flat speed for a run, a single
 * pace, and for a ride the watts whose page equivalent is that speed, with the range the equivalence gives.
 * A sport added to SPORT_ORDER says its inverse here.
 */
const NATIVE_AT_GRADE: Record<
  Sport,
  (grade: number, durationS: number, athlete: TargetAthlete) => NativeRange | null
> = {
  run: (grade, durationS, athlete) => {
    const speed = runSpeedAtGrade(grade, durationS, athlete)
    return speed === null ? null : { low: speed, centre: speed, high: speed }
  },
  ride: (grade, durationS, athlete) => {
    const speed = runSpeedAtGrade(grade, durationS, athlete)
    return speed === null ? null : wattsRangeAtSpeed(speed, athlete)
  },
}

/** The sport's own range that grades at the target over durationS, or null when none does. */
export function nativeRangeAtGrade(
  sport: Sport,
  grade: number,
  durationS: number,
  athlete: TargetAthlete,
): NativeRange | null {
  return NATIVE_AT_GRADE[sport](grade, durationS, athlete)
}

/** The sport's own centre that grades at the target over durationS, or null when none does. */
export function nativeAtGrade(
  sport: Sport,
  grade: number,
  durationS: number,
  athlete: TargetAthlete,
): number | null {
  return nativeRangeAtGrade(sport, grade, durationS, athlete)?.centre ?? null
}

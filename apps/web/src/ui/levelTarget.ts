import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  FIRST_GRADED_DISTANCE_M,
  LAST_GRADED_DISTANCE_M,
  ageGradeForEffort,
  gradeCeiling,
} from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import { equivalenceFor } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { HrCalibration, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatWatts, paceSeconds } from '@rca/core/units'
import type { Lean } from '../domain/lean'
import { HEADLINE_LABEL, type GradeOutcome } from './grades'
import { activityMasses } from './activityMasses'
import { wholeGrade } from './gradeFormat'
import { curveOf, valueAt } from './records'
import { SPORT_FORMAT, SPORT_NOUN } from './sports'

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
/** The pace is named on a 5 s step, and the watts on a 5 W step. */
const PACE_STEP_S = 5
const WATTS_STEP = 5

/** Rounds up to the next multiple of step. */
function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

/** Rounds down to the multiple of step at or below value. */
function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step
}

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

/**
 * A best effort's own figure from its curve value. A run's curve holds gross metabolic W/kg, read as
 * its flat speed; a ride's curve already holds watts.
 */
const OWN_OF_CURVE: Record<Sport, (value: number) => number> = {
  run: (value) => metabolicToFlatSpeed(value),
  ride: (watts) => watts,
}

/**
 * A sport's own number for the best effort, as it would read at today's mass. A ride's watts were held
 * at the body mass on its day, and the target is worked out at today's, so the two are compared at
 * the same power-to-weight. Without dated masses the two masses are one, and a run has no mass.
 */
const AT_TODAYS_MASS: Record<Sport, (own: number, rideKg: number, todayKg: number) => number> = {
  run: (speed) => speed,
  ride: (watts, rideKg, todayKg) => (watts * todayKg) / rideKg,
}

/** Whether a sport's own number depends on body mass: a ride's watts do, a run's pace does not. */
const MASS_DEPENDENT: Record<Sport, boolean> = { run: false, ride: true }

/** A pace, m/s, taken at the faster whole 5 s, so the rounded pace reaches the target. */
function levelledSpeed(speedMs: number, units: UnitSystem): number {
  const seconds = paceSeconds(speedMs, units)
  const levelled = Math.max(PACE_STEP_S, floorTo(seconds, PACE_STEP_S))
  return speedMs * (seconds / levelled)
}

/**
 * A target rounded toward the side that levels, in the sport's own unit: a run's pace is taken at the
 * faster whole 5 s, and a ride's centre watts up to the next 5 W. The range's low end rounds down and its
 * high end rounds up, so the rounded range still holds the centre. Whole-percent grades floor, so a
 * figure rounded the other way could leave the balance a percent short of level.
 */
const LEVELLED: Record<Sport, (range: NativeRange, units: UnitSystem) => NativeRange> = {
  run: (range, units) => {
    const pace = levelledSpeed(range.centre, units)
    return { low: pace, centre: pace, high: pace }
  },
  ride: (range) => ({
    low: floorTo(range.low, WATTS_STEP),
    centre: ceilTo(range.centre, WATTS_STEP),
    high: ceilTo(range.high, WATTS_STEP),
  }),
}

/** The range rounded toward the side that levels: see LEVELLED. */
export function levelledRange(sport: Sport, range: NativeRange, units: UnitSystem): NativeRange {
  return LEVELLED[sport](range, units)
}

/** The centre of a single figure, rounded toward the side that levels: see LEVELLED. */
export function levelledNative(sport: Sport, native: number, units: UnitSystem): number {
  return levelledRange(sport, { low: native, centre: native, high: native }, units).centre
}

/**
 * The levelled target as the words a sentence uses, with the figure the page shows for the lower
 * sport's best effort: a flat pace, or watts with the range the ride's estimate carries.
 */
const SHOWN_TEXT: Record<Sport, (levelled: NativeRange, now: string, units: UnitSystem) => string> =
  {
    run: (levelled, now, units) =>
      `a flat pace of about ${formatClock(paceSeconds(levelled.centre, units))} ${PACE_UNIT[units]} (now ${now})`,
    ride: (levelled, now) =>
      `about ${formatWatts(levelled.centre)} W (roughly ${formatWatts(levelled.low)} to ${formatWatts(levelled.high)} W; now ${now})`,
  }

/**
 * Whether the levelled centre is strictly beyond the figure the page shows for the lower sport's best
 * effort: more whole watts, or a faster whole second of pace. Compared on the shown figures, so a
 * target that reads the same as the figure on screen is not a change to name.
 */
const BEYOND_SHOWN: Record<Sport, (levelled: number, now: number, units: UnitSystem) => boolean> = {
  run: (target, now, units) =>
    Math.round(paceSeconds(target, units)) < Math.round(paceSeconds(now, units)),
  ride: (target, now) => Math.round(target) > Math.round(now),
}

/** A levelled centre as the sport's own figure with its unit: "270 W" or "6:50 /mi". */
const OWN_TEXT: Record<Sport, (centre: number, units: UnitSystem) => string> = {
  run: (centre, units) => `${formatClock(paceSeconds(centre, units))} ${PACE_UNIT[units]}`,
  ride: (centre) => `${formatWatts(centre)} W`,
}

/** A ride's levelled range as its low and high watts. A run has one pace, so it names no range. */
const RANGE_TEXT: Record<Sport, (levelled: NativeRange) => string> = {
  run: () => '',
  ride: (levelled) => `${formatWatts(levelled.low)} to ${formatWatts(levelled.high)} W`,
}

/** The best effort as a noun in a sentence: "your best run", "your best ride". */
const BEST_NOUN: Record<Sport, string> = { run: 'run', ride: 'ride' }

/** The sport the balance does not lean toward: the one a level target is named for. */
const OTHER_SPORT: Record<Sport, Sport> = { run: 'ride', ride: 'run' }

/**
 * Whether a target grade is out of reach for a sport: above the ceiling, or at it where a figure at the
 * ceiling is itself at the top of the age tables (a ride's), so a ride is never asked to reach what the page
 * would not grade.
 */
const FLAGGED_AT_CEILING: Record<Sport, boolean> = { run: false, ride: true }

function beyondCeiling(sport: Sport, target: number, ceiling: number): boolean {
  return FLAGGED_AT_CEILING[sport] ? target >= ceiling : target > ceiling
}

/** The inputs a level target reads: the balance, both grades, the athlete's sex and mass, and the units. */
export interface LevelTargetInput {
  /** The sport the balance leans toward, which is the higher of the two. */
  lean: Lean
  grades: Record<Sport, GradeOutcome | null>
  result: AnalysisResult
  sex: Sex
  massKg: number
  units: UnitSystem
  /** The library's heart-rate calibration (`HeartRateJudgement.calibration`), as the page's equivalents use it. */
  calibration: HrCalibration | null
}

/**
 * What the lower sport would need to grade level with the higher sport's whole-percent grade, as
 * the pieces a sentence or a drawing uses: the sports, the levelled figure, the range a ride's estimate
 * carries, and the figure the page shows now.
 */
export interface LevelTarget {
  higher: Sport
  lower: Sport
  /** The levelled centre as the sport's own text: "270 W" or "6:50 /mi". */
  centre: string
  /** A ride's range as text, "245 to 295 W"; null for a run, which has one pace. */
  range: string | null
  /** The figure the page shows for the lower sport's best effort, with today's weight beside it when it differs. */
  now: string
  /** The target's sentence, as the page words it. */
  sentence: string
}

/**
 * The lower sport's best effort at the headline duration, as what it would need to grade level with the
 * higher sport's whole-percent grade: rounded toward the levelling side, and for a ride with the range its
 * estimate carries. Null when the balance is even, when either grade is not on screen, when the target is above
 * 100% or at the ceiling of what a runner of this age and sex has run, or when the levelled centre is not strictly
 * beyond the figure the page already shows.
 */
export function levelTarget(input: LevelTargetInput): LevelTarget | null {
  const { lean, grades, result, sex, massKg, units, calibration } = input
  if (lean === 'even') return null
  const higher = lean
  const lower = OTHER_SPORT[higher]
  const lowerGrade = grades[lower]
  const higherGrade = grades[higher]
  if (!lowerGrade || lowerGrade.kind !== 'graded') return null
  if (!higherGrade || higherGrade.kind !== 'graded') return null
  const target = wholeGrade(higherGrade.grade.centre.grade) / 100
  const athlete = { age: lowerGrade.age, sex, massKg, calibration }
  // A grade above 100% is not a level anyone can be asked to reach, and neither is a figure the lower sport
  // would itself be flagged at: the same ceiling that holds a ride's grade down holds the target down.
  const ceiling = gradeCeiling(HEADLINE_DURATION_S, athlete.age, sex)
  if (target > 1 || (ceiling !== null && beyondCeiling(lower, target, ceiling))) return null
  const needed = nativeRangeAtGrade(lower, target, HEADLINE_DURATION_S, athlete)
  const curve = curveOf(result, lower)
  const shown = OWN_OF_CURVE[lower](valueAt(curve, HEADLINE_DURATION_S))
  // A ride held at another weight is compared at today's, as the target is; every other effort is as shown.
  const rideKg = activityMasses(result.activities)[
    curve.find((p) => p.durationS === HEADLINE_DURATION_S)?.activityId ?? ''
  ]
  const reweighted = MASS_DEPENDENT[lower] && rideKg !== undefined && rideKg !== massKg
  const now = reweighted ? AT_TODAYS_MASS[lower](shown, rideKg, massKg) : shown
  if (needed === null || !Number.isFinite(now)) return null
  const levelled = levelledRange(lower, needed, units)
  if (!BEYOND_SHOWN[lower](levelled.centre, now, units)) return null
  const level = `To grade level with your ${SPORT_NOUN[higher]} at ${HEADLINE_LABEL}`
  // The figure the page shows for the ride stays the one named, with today's weight beside it when it differs.
  const shownText = SPORT_FORMAT[lower].formatted(shown, units)
  const nowText = reweighted
    ? `${shownText}, ${SPORT_FORMAT[lower].formatted(now, units)} at today’s weight`
    : shownText
  const sentence = `${level}, your best ${BEST_NOUN[lower]} would need ${SHOWN_TEXT[lower](levelled, nowText, units)}.`
  return {
    higher,
    lower,
    centre: OWN_TEXT[lower](levelled.centre, units),
    range: levelled.low === levelled.high ? null : RANGE_TEXT[lower](levelled),
    now: nowText,
    sentence,
  }
}

/** The target's sentence for the page, or null when there is no target. */
export function levelTargetText(input: LevelTargetInput): string | null {
  return levelTarget(input)?.sentence ?? null
}

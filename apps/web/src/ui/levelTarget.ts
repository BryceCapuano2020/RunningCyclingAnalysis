import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { ageGradeForEffort, gradeCeiling } from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { HrCalibration, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatWatts, paceSeconds } from '@rca/core/units'
import type { Lean } from '../domain/lean'
import { HEADLINE_LABEL, type GradeOutcome } from './grades'
import { activityMasses } from './activityMasses'
import { wholeGrade } from './gradeFormat'
import { nativeRangeAtGrade } from './levelSolver'
import type { NativeRange, TargetAthlete } from './levelSolver'
import { curveOf, valueAt } from './records'
import { SPORT_FORMAT, SPORT_NOUN } from './sports'

export { nativeAtGrade, nativeRangeAtGrade } from './levelSolver'
export type { NativeRange, TargetAthlete } from './levelSolver'

/** The watts are named on a 5 W step; a pace is named to the whole second, as the page names every pace. */
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

/**
 * What a rounded target has to reach: the higher sport's whole-percent grade, over the headline duration, for the
 * athlete the lower sport is graded as.
 */
export interface Reach {
  wholePercent: number
  durationS: number
  athlete: TargetAthlete
}

/** The most whole seconds a pace is moved faster to reach its grade: the nearest second is within one of it. */
const MAX_PACE_STEPS = 3

/**
 * A pace, m/s, named to the nearest whole second, as the Ride on foot tile names the same pace, and the
 * faster second where the nearer one would grade a whole percent short.
 */
function namedPace(speedMs: number, units: UnitSystem, reach: Reach): number {
  const metres = paceSeconds(1, units)
  const { wholePercent, durationS, athlete } = reach
  const reaches = (seconds: number) =>
    wholeGrade(ageGradeForEffort(metres / seconds, durationS, athlete.age, athlete.sex) ?? 0) >=
    wholePercent
  let seconds = Math.max(1, Math.round(paceSeconds(speedMs, units)))
  for (let step = 0; step < MAX_PACE_STEPS && seconds > 1 && !reaches(seconds); step++) seconds -= 1
  return metres / seconds
}

/**
 * A target named as the page names it, in the sport's own unit: a run's pace to the whole second, nearest the exact
 * pace its grade needs (so it reads as the pace the tile gives the same effort), and held a second faster when
 * that would fall a whole percent short; a ride's centre watts up to the next 5 W. The range's low end rounds down and its
 * high end rounds up, so the rounded range still holds the centre. Whole-percent grades floor, so a
 * figure rounded the other way could leave the balance a percent short of level.
 */
const LEVELLED: Record<
  Sport,
  (range: NativeRange, units: UnitSystem, reach: Reach) => NativeRange
> = {
  run: (range, units, reach) => {
    const pace = namedPace(range.centre, units, reach)
    return { low: pace, centre: pace, high: pace }
  },
  ride: (range) => ({
    low: floorTo(range.low, WATTS_STEP),
    centre: ceilTo(range.centre, WATTS_STEP),
    high: ceilTo(range.high, WATTS_STEP),
  }),
}

/** The range rounded toward the side that levels: see LEVELLED. */
export function levelledRange(
  sport: Sport,
  range: NativeRange,
  units: UnitSystem,
  reach: Reach,
): NativeRange {
  return LEVELLED[sport](range, units, reach)
}

/** The centre of a single figure, rounded toward the side that levels: see LEVELLED. */
export function levelledNative(
  sport: Sport,
  native: number,
  units: UnitSystem,
  reach: Reach,
): number {
  return levelledRange(sport, { low: native, centre: native, high: native }, units, reach).centre
}

/**
 * The levelled target as the words a sentence uses, with the figure the page shows for the lower
 * sport's best effort: a flat pace, or watts with the range the ride's estimate carries.
 */
const SHOWN_TEXT: Record<Sport, (levelled: NativeRange, now: string, units: UnitSystem) => string> =
  {
    run: (levelled, now, units) =>
      `a flat pace of ${formatClock(paceSeconds(levelled.centre, units))} ${PACE_UNIT[units]} (now ${now})`,
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

/**
 * The grade the inverse is worked out at, for the lower sport: a run's is the higher grade exactly, so the pace is the one the
 * Ride on foot tile names for the same effort (that tile's pace is what the ride's grade is read from); a ride's is the whole
 * percent, since its watts are named up to the next 5 W and a whole percent is all the page says of the run.
 */
const INVERSE_GRADE: Record<Sport, (exact: number, whole: number) => number> = {
  run: (exact) => exact,
  ride: (_, whole) => whole,
}

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
  const needed = nativeRangeAtGrade(
    lower,
    INVERSE_GRADE[lower](higherGrade.grade.centre.grade, target),
    HEADLINE_DURATION_S,
    athlete,
  )
  const curve = curveOf(result, lower)
  const shown = OWN_OF_CURVE[lower](valueAt(curve, HEADLINE_DURATION_S))
  // A ride held at another weight is compared at today's, as the target is; every other effort is as shown.
  const rideKg = activityMasses(result.activities)[
    curve.find((p) => p.durationS === HEADLINE_DURATION_S)?.activityId ?? ''
  ]
  const reweighted = MASS_DEPENDENT[lower] && rideKg !== undefined && rideKg !== massKg
  const now = reweighted ? AT_TODAYS_MASS[lower](shown, rideKg, massKg) : shown
  if (needed === null || !Number.isFinite(now)) return null
  const reach = {
    wholePercent: wholeGrade(higherGrade.grade.centre.grade),
    durationS: HEADLINE_DURATION_S,
    athlete,
  }
  const levelled = levelledRange(lower, needed, units, reach)
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

import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { FIRST_GRADED_DISTANCE_M, LAST_GRADED_DISTANCE_M, ageGradeForEffort } from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import { equivalenceFor } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatPower, paceSeconds } from '@rca/core/units'
import type { Lean } from '../domain/lean'
import { HEADLINE_LABEL, type GradeOutcome } from './grades'
import { wholeGrade } from './gradeFormat'
import { curveOf, valueAt } from './records'
import { SPORT_FORMAT, SPORT_NOUN } from './sports'

/**
 * The athlete an inverse is for: the age and sex the lower sport was graded at, the body mass, and the
 * result's heart-rate cross-check, which the page's ride equivalence weighs its draws by.
 */
export interface TargetAthlete {
  age: number
  sex: Sex
  massKg: number
  hr: AnalysisResult['hr']
}

/**
 * Bisection steps. Each halves the bracket, so 25 steps leave a power or a speed within a few millionths of
 * its bracket, far below the 5 W and 5 s steps the target is rounded to.
 */
const BISECTION_STEPS = 25
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
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const mid = (lo + hi) / 2
    if (gradeAt(mid) < grade) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The watts whose page equivalent, the p50 of equivalentRunSpeed that the ride's grade is read from,
 * is the target speed. Equivalent speed rises with watts, so bisection finds the one power. Null when
 * no power up to a generous bracket reaches the speed.
 */
function wattsAtSpeed(speedMs: number, athlete: TargetAthlete): number | null {
  // Built once: the draws and the heart-rate weights do not change with the watts searched.
  const equivalence = equivalenceFor(athlete.hr)
  const p50At = (watts: number) => equivalence(watts, athlete.massKg).p50
  let hi = FIRST_WATTS
  for (let i = 0; i < MAX_DOUBLINGS && p50At(hi) < speedMs; i++) hi *= 2
  if (!(p50At(hi) >= speedMs)) return null
  let lo = 0
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const mid = (lo + hi) / 2
    if (p50At(mid) < speedMs) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The sport's own figure that grades at the target, for each sport: the flat speed for a run, and
 * the watts for a ride, whose page equivalent is that speed. A sport added to SPORT_ORDER says its
 * inverse here.
 */
const NATIVE_AT_GRADE: Record<
  Sport,
  (grade: number, durationS: number, athlete: TargetAthlete) => number | null
> = {
  run: (grade, durationS, athlete) => runSpeedAtGrade(grade, durationS, athlete),
  ride: (grade, durationS, athlete) => {
    const speed = runSpeedAtGrade(grade, durationS, athlete)
    return speed === null ? null : wattsAtSpeed(speed, athlete)
  },
}

/** The sport's own figure that grades at the target over durationS, or null when none does. */
export function nativeAtGrade(
  sport: Sport,
  grade: number,
  durationS: number,
  athlete: TargetAthlete,
): number | null {
  return NATIVE_AT_GRADE[sport](grade, durationS, athlete)
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
 * A target rounded toward the side that levels, in the sport's own unit: a run's speed is taken at the
 * faster pace on a 5 s step, and a ride's watts up to the next 5 W. Whole-percent grades floor, so a
 * figure rounded the other way could leave the balance a percent short of level.
 */
const LEVELLED: Record<Sport, (native: number, units: UnitSystem) => number> = {
  run: (speedMs, units) => {
    const seconds = paceSeconds(speedMs, units)
    const levelled = Math.max(PACE_STEP_S, floorTo(seconds, PACE_STEP_S))
    return speedMs * (seconds / levelled)
  },
  ride: (watts) => ceilTo(watts, WATTS_STEP),
}

/** The target, rounded toward the side that levels: see LEVELLED. */
export function levelledNative(sport: Sport, native: number, units: UnitSystem): number {
  return LEVELLED[sport](native, units)
}

/** The levelled target as the words a sentence uses: a flat pace, or watts. */
const TARGET_TEXT: Record<Sport, (levelled: number, units: UnitSystem) => string> = {
  run: (speedMs, units) =>
    `a flat pace of about ${formatClock(paceSeconds(speedMs, units))} ${PACE_UNIT[units]}`,
  ride: (watts) => `about ${formatPower(watts)}`,
}

/**
 * Whether the levelled target is strictly beyond the figure the page shows for the lower sport's best
 * effort: more whole watts, or a faster whole second of pace. Compared on the shown figures, so a
 * target that reads the same as the figure on screen is not a change to name.
 */
const BEYOND_SHOWN: Record<Sport, (levelled: number, now: number, units: UnitSystem) => boolean> = {
  run: (target, now, units) =>
    Math.round(paceSeconds(target, units)) < Math.round(paceSeconds(now, units)),
  ride: (target, now) => Math.round(target) > Math.round(now),
}

/** The best effort as a noun in a sentence: "your best run", "your best ride". */
const BEST_NOUN: Record<Sport, string> = { run: 'run', ride: 'ride' }

/** The sport the balance does not lean toward: the one a level target is named for. */
const OTHER_SPORT: Record<Sport, Sport> = { run: 'ride', ride: 'run' }

/** The inputs a level target reads: the balance, both grades, the athlete's sex and mass, and the units. */
export interface LevelTargetInput {
  /** The sport the balance leans toward, which is the higher of the two. */
  lean: Lean
  grades: Record<Sport, GradeOutcome | null>
  result: AnalysisResult
  sex: Sex
  massKg: number
  units: UnitSystem
}

/**
 * The lower sport's best effort at the headline duration, as the sentence that says what it would
 * need to grade level with the higher sport's whole-percent grade, rounded toward the levelling side. Null
 * when the balance is even, when either grade is not on screen, or when the levelled target is not
 * strictly beyond the figure the page already shows for the lower sport.
 */
export function levelTargetText(input: LevelTargetInput): string | null {
  const { lean, grades, result, sex, massKg, units } = input
  if (lean === 'even') return null
  const higher = lean
  const lower = OTHER_SPORT[higher]
  const lowerGrade = grades[lower]
  const higherGrade = grades[higher]
  if (!lowerGrade || lowerGrade.kind !== 'graded') return null
  if (!higherGrade || higherGrade.kind !== 'graded') return null
  const target = wholeGrade(higherGrade.grade.centre.grade) / 100
  const athlete = { age: lowerGrade.age, sex, massKg, hr: result.hr }
  const needed = nativeAtGrade(lower, target, HEADLINE_DURATION_S, athlete)
  const now = OWN_OF_CURVE[lower](valueAt(curveOf(result, lower), HEADLINE_DURATION_S))
  if (needed === null || !Number.isFinite(now)) return null
  const levelled = levelledNative(lower, needed, units)
  if (!BEYOND_SHOWN[lower](levelled, now, units)) return null
  const level = `To grade level with your ${SPORT_NOUN[higher]} at ${HEADLINE_LABEL}`
  const nowText = SPORT_FORMAT[lower].formatted(now, units)
  return `${level}, your best ${BEST_NOUN[lower]} would need ${TARGET_TEXT[lower](levelled, units)} (now ${nowText}).`
}

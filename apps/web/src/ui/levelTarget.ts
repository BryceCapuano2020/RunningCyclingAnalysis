import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { FIRST_GRADED_DISTANCE_M, LAST_GRADED_DISTANCE_M, ageGradeForEffort } from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import { equivalentRunSpeed } from '@rca/core/digest'
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

/** Bisection steps: far more than a speed or a power needs to be exact to a unit. */
const BISECTION_STEPS = 60
/** The first power tried when a ride's watts are bracketed, and how many times it doubles to reach a speed. */
const FIRST_WATTS = 100
const MAX_DOUBLINGS = 16
/** The pace is named to the nearest 5 s, and the watts to the nearest 5 W. */
const PACE_STEP_S = 5
const WATTS_STEP = 5

/** Rounds to the nearest multiple of step. */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
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
  const p50At = (watts: number) => equivalentRunSpeed(watts, athlete.massKg, athlete.hr).p50
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

/** The target as the words a sentence uses, rounded: a flat pace to 5 s, and watts to 5 W. */
const TARGET_TEXT: Record<Sport, (native: number, units: UnitSystem) => string> = {
  run: (speedMs, units) =>
    `a flat pace of about ${formatClock(roundTo(paceSeconds(speedMs, units), PACE_STEP_S))} ${PACE_UNIT[units]}`,
  ride: (watts) => `about ${formatPower(roundTo(watts, WATTS_STEP))}`,
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
 * need to grade level with the higher sport's whole-percent grade. Null when the balance is even,
 * when either grade is not on screen, or when the lower sport already reaches the target.
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
  if (needed === null || !Number.isFinite(now) || !(needed > now)) return null
  const level = `To grade level with your ${SPORT_NOUN[higher]} at ${HEADLINE_LABEL}`
  const nowText = SPORT_FORMAT[lower].formatted(now, units)
  return `${level}, your best ${BEST_NOUN[lower]} would need ${TARGET_TEXT[lower](needed, units)} (now ${nowText}).`
}

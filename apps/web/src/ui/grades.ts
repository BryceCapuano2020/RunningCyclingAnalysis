import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  FIRST_GRADED_AGE,
  GRADE_LEVELS,
  LAST_GRADED_AGE,
  ageAt,
  ageGradeForEffort,
  gradePercent,
  levelOf,
} from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { curveOf } from './records'

/** The year of birth and sex that every grade needs. Null on the page when either is missing. */
export interface AgeProfile {
  birthYear: number
  sex: Sex
}

/** The athlete's age on the date of an effort, with their sex. */
export interface Athlete {
  age: number
  sex: Sex
}

/** An age grade: the fraction, its percentage to one decimal place (rounded down) and its level. */
export interface Grade {
  grade: number
  percent: number
  level: string
}

/**
 * A sport's age grade at the headline duration. A run is one activity's estimate and has no range.
 * A ride is estimated through its running equivalent, so it carries the model's range.
 */
export interface SportGrade {
  centre: Grade
  range: { low: Grade; high: Grade } | null
}

/** Either a grade, with the age it was taken at, or the reason there is none to show. */
export type GradeOutcome =
  { kind: 'graded'; age: number; grade: SportGrade } | { kind: 'gap'; reason: string }

export interface HeadlineGrades {
  run: GradeOutcome
  ride: GradeOutcome
}

/** The headline length as copy, built by the duration formatter: "20 min". */
export const HEADLINE_LABEL = formatDuration(HEADLINE_DURATION_S)

/** No best effort of the headline length exists yet, so there is nothing to grade. */
export const NEEDS_EFFORT_TEXT = `Age grade needs a best ${HEADLINE_LABEL} effort.`
/**
 * The best effort is there, but no age standard or running equivalent grades it: a run under a mile,
 * or a ride with no equivalent at that length.
 */
export const NO_STANDARD_TEXT =
  'This best effort has no age standard or running equivalent to grade it.'
/** The activity behind the best effort is not in the library, so the age on its date is unknown. */
export const NO_DATE_TEXT = 'This best effort cannot be dated, so it is not graded.'
export const AGE_RANGE_TEXT = `Age grades cover ages ${FIRST_GRADED_AGE} to ${LAST_GRADED_AGE}.`

/** The level bands from lowest to highest, with the lower bound of each. */
export const LEVEL_BANDS: readonly { name: string; min: number }[] = [...GRADE_LEVELS]
  .reverse()
  .map((band) => ({ name: band.label, min: band.min }))

export const SEX_NOUN: Record<Sex, string> = { female: 'woman', male: 'man' }

/**
 * The athlete's age on atMs, from the year of birth. Null outside the ages the standards cover,
 * so an age the standards cannot grade is never used.
 */
export function athleteOf(profile: AgeProfile, atMs: number): Athlete | null {
  const age = ageAt(profile.birthYear, atMs)
  if (age === null || age < FIRST_GRADED_AGE || age > LAST_GRADED_AGE) return null
  return { age, sex: profile.sex }
}

function gradeOf(grade: number | null): Grade | null {
  if (grade === null) return null
  const percent = gradePercent(grade)
  const level = levelOf(grade)
  return percent === null || level === null ? null : { grade, percent, level }
}

function gap(reason: string): GradeOutcome {
  return { kind: 'gap', reason }
}

/** The start of the activity with this id, or null when it is not among the result's activities. */
function startOf(result: AnalysisResult, activityId: string | null): number | null {
  if (activityId === null) return null
  return result.activities.find((activity) => activity.id === activityId)?.startMs ?? null
}

/**
 * A run's grade from its flat speed. It is one activity's estimate, drawn as a dot. Null when the
 * distance covered has no standard (under 1 mile or over 200 km).
 */
function runGradeAt(speedMs: number, durationS: number, athlete: Athlete): SportGrade | null {
  const centre = gradeOf(ageGradeForEffort(speedMs, durationS, athlete.age, athlete.sex))
  return centre === null ? null : { centre, range: null }
}

/**
 * A ride's grade from its running equivalent: the centre, and the model's range from the 5th to
 * the 95th percentile. Null without an equivalent at durationS, or when an end has no grade.
 */
function rideGradeAt(
  result: AnalysisResult,
  durationS: number,
  athlete: Athlete,
): SportGrade | null {
  const equivalent = result.equivalents.find((candidate) => candidate.durationS === durationS)
  if (!equivalent) return null
  const at = (speedMs: number) =>
    gradeOf(ageGradeForEffort(speedMs, durationS, athlete.age, athlete.sex))
  const low = at(equivalent.runSpeed.p05)
  const centre = at(equivalent.runSpeed.p50)
  const high = at(equivalent.runSpeed.p95)
  return low && centre && high ? { centre, range: { low, high } } : null
}

/**
 * A sport's age grade at durationS, taken at the age on the date of the activity that set the best
 * effort there. A ride's equivalent comes from its own best ride at that duration, so a ride is
 * dated by that ride. Returns the reason when there is no grade to show.
 */
export function sportGrade(
  result: AnalysisResult,
  sport: Sport,
  durationS: number,
  profile: AgeProfile,
): GradeOutcome {
  const curve = curveOf(result, sport)
  const point = curve.find((candidate) => candidate.durationS === durationS)
  if (point === undefined || !Number.isFinite(point.value)) return gap(NEEDS_EFFORT_TEXT)
  const startMs = startOf(result, point.activityId)
  if (startMs === null) return gap(NO_DATE_TEXT)
  const athlete = athleteOf(profile, startMs)
  if (athlete === null) return gap(AGE_RANGE_TEXT)
  const grade =
    sport === 'run'
      ? runGradeAt(metabolicToFlatSpeed(point.value), durationS, athlete)
      : rideGradeAt(result, durationS, athlete)
  return grade === null ? gap(NO_STANDARD_TEXT) : { kind: 'graded', age: athlete.age, grade }
}

/** Both sports' grades at the headline duration, each at its own date. */
export function headlineGrades(result: AnalysisResult, profile: AgeProfile): HeadlineGrades {
  return {
    run: sportGrade(result, 'run', HEADLINE_DURATION_S, profile),
    ride: sportGrade(result, 'ride', HEADLINE_DURATION_S, profile),
  }
}

/**
 * The sex the grades are for, when either sport shows a grade at the headline duration; null when
 * neither does, or the profile is missing. A page cites its standard only with this sex in hand.
 */
export function gradedSexOf(
  headline: HeadlineGrades | null,
  profile: AgeProfile | null,
): Sex | null {
  if (headline === null || profile === null) return null
  const shown = headline.run.kind === 'graded' || headline.ride.kind === 'graded'
  return shown ? profile.sex : null
}

/**
 * The grade as the cards write it: "Estimated age grade 63% · Local", and a ride's range in
 * brackets: "Estimated age grade 47% · Recreational (44–50%)".
 */
export function gradeSentence(grade: SportGrade): string {
  const sentence = `Estimated age grade ${grade.centre.percent}% · ${grade.centre.level}`
  const range = grade.range
  return range ? `${sentence} (${range.low.percent}–${range.high.percent}%)` : sentence
}

/** A record's grade sentence, or null when the outcome is a gap. */
export function outcomeSentence(outcome: GradeOutcome): string | null {
  return outcome.kind === 'graded' ? gradeSentence(outcome.grade) : null
}

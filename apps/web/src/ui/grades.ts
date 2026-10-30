import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  FIRST_GRADED_AGE,
  GRADE_LEVELS,
  LAST_GRADED_AGE,
  ageAt,
  ageGradeForEffort,
  gradeCeiling,
  levelOf,
} from '@rca/core/grade'
import type { Sex } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Interval, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { formatGrade, wholeGrade } from './gradeFormat'
import { curveOf } from './records'

/** The year of birth and sex that every grade needs. Null on the page when either is missing. */
export interface AgeProfile {
  birthYear: number
  sex: Sex
}

/** The profile the grades need, or null while the year of birth or the sex is missing. */
export function ageProfileOf(birthYear: number | null, sex: Sex | null): AgeProfile | null {
  return birthYear !== null && sex !== null ? { birthYear, sex } : null
}

/** The part of the profile the grades still need, named as the prompts name it. */
export type AgeGap = 'year of birth' | 'sex' | 'year of birth and sex'

/** What the grades are missing, so a prompt names only that; null when both are given. */
export function missingAgeOf(birthYear: number | null, sex: Sex | null): AgeGap | null {
  if (birthYear === null) return sex === null ? 'year of birth and sex' : 'year of birth'
  return sex === null ? 'sex' : null
}

/** The age on the date of an effort, with the sex it is graded for. */
export interface AgeAndSex {
  age: number
  sex: Sex
}

/** An age grade: the fraction and its level. Its whole percent is `wholeGrade`, and its text `formatGrade`. */
export interface Grade {
  grade: number
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
  | { kind: 'graded'; age: number; grade: SportGrade }
  /**
   * A ride whose running equivalent is at or above what the age tables cover (see gradeCeiling): capped at 100%,
   * with no grade of its own, and left out of the comparison with the run. Not a fault in the input.
   */
  | { kind: 'top-of-scale'; age: number }
  | { kind: 'gap'; reason: string }

export interface HeadlineGrades {
  run: GradeOutcome
  ride: GradeOutcome
}

/** The headline length as copy, built by the duration formatter: "20 min". */
export const HEADLINE_LABEL = formatDuration(HEADLINE_DURATION_S)

/** What a grade is, said once under a sport page's caption and at the end of the Balance footer. */
export const LEVEL_NOT_RANKING = 'A level, not a ranking.'

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
/** A ride's best effort is at or above the top of the age tables: said plainly, with no prompt to check anything. */
export const TOP_OF_SCALE_TEXT = `Your best ${HEADLINE_LABEL} ride power is at the top of what the age tables cover, so it is capped at 100% and left out of the comparison with your running.`
/** The same in a few words, for a row or a line under the meter. */
export const TOP_OF_SCALE_SHORT = 'At the top of the age tables'
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
export function ageAndSexAt(profile: AgeProfile, atMs: number): AgeAndSex | null {
  const age = ageAt(profile.birthYear, atMs)
  if (age === null || age < FIRST_GRADED_AGE || age > LAST_GRADED_AGE) return null
  return { age, sex: profile.sex }
}

function gradeOf(grade: number | null): Grade | null {
  if (grade === null) return null
  const level = levelOf(grade)
  return level === null ? null : { grade, level }
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
 * The grade of holding a flat running speed for durationS, for an athlete of a given age and sex.
 * Every grade the app shows, the cards and the trend alike, comes through here. Null when the
 * distance has no standard.
 */
export function gradeAtSpeed(
  speedMs: number,
  durationS: number,
  ageAndSex: AgeAndSex,
): Grade | null {
  return gradeOf(ageGradeForEffort(speedMs, durationS, ageAndSex.age, ageAndSex.sex))
}

/**
 * A run's grade from its flat speed. It is one activity's estimate, drawn as a dot. Null when the
 * distance covered has no standard (under 1 mile or over 200 km).
 */
function runGradeAt(speedMs: number, durationS: number, ageAndSex: AgeAndSex): SportGrade | null {
  const centre = gradeAtSpeed(speedMs, durationS, ageAndSex)
  return centre === null ? null : { centre, range: null }
}

/** A ride's grade read from its running-equivalent speeds, and whether it reaches the top of the age tables. */
export interface RideGradeRead {
  /** The grade with every end held at the ceiling, so none is above 100%. */
  grade: SportGrade
  /** The centre is at or above the ceiling: the ride is at the top of the scale. */
  top: boolean
}

/**
 * The one reading of a ride's running equivalent as a grade, for the cards and the trend alike. A ride has no
 * ceiling of its own, so the running record bounds it (gradeCeiling): an end above the ceiling is held at it, and
 * a centre at or above it is at the top of the scale. With no ceiling (the record's distance at this length is
 * under the shortest standard) any graded equivalent is past it, and the ends above 100% are held at 100%. Null
 * when an end has no grade.
 */
export function rideGradeFromSpeeds(
  runSpeed: Interval,
  durationS: number,
  ageAndSex: AgeAndSex,
): RideGradeRead | null {
  const at = (speedMs: number) => gradeAtSpeed(speedMs, durationS, ageAndSex)
  const low = at(runSpeed.p05)
  const centre = at(runSpeed.p50)
  const high = at(runSpeed.p95)
  if (!(low && centre && high)) return null
  const ceiling = gradeCeiling(durationS, ageAndSex.age, ageAndSex.sex) ?? 1
  const held = (grade: Grade): Grade =>
    grade.grade > ceiling ? (gradeOf(ceiling) ?? grade) : grade
  return {
    grade: { centre: held(centre), range: { low: held(low), high: held(high) } },
    top: centre.grade >= ceiling,
  }
}

/** A ride's grade from its running equivalent at durationS; null without an equivalent there. */
function rideGradeAt(
  result: AnalysisResult,
  durationS: number,
  ageAndSex: AgeAndSex,
): RideGradeRead | null {
  const equivalent = result.equivalents.find((candidate) => candidate.durationS === durationS)
  return equivalent ? rideGradeFromSpeeds(equivalent.runSpeed, durationS, ageAndSex) : null
}

/**
 * A sport's age grade at durationS, taken at the age on the date of the activity that set the best
 * effort there. A ride's equivalent comes from its own best ride at that duration, so a ride is
 * dated by that ride. A ride at the top of the age tables is its own outcome, and any other lack of a grade
 * comes back as the reason.
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
  const ageAndSex = ageAndSexAt(profile, startMs)
  if (ageAndSex === null) return gap(AGE_RANGE_TEXT)
  if (sport === 'run') {
    const grade = runGradeAt(metabolicToFlatSpeed(point.value), durationS, ageAndSex)
    return grade === null ? gap(NO_STANDARD_TEXT) : { kind: 'graded', age: ageAndSex.age, grade }
  }
  const ride = rideGradeAt(result, durationS, ageAndSex)
  if (ride === null) return gap(NO_STANDARD_TEXT)
  return ride.top
    ? { kind: 'top-of-scale', age: ageAndSex.age }
    : { kind: 'graded', age: ageAndSex.age, grade: ride.grade }
}

/** Whether a ride's outcome is the top of the scale, which the balance leaves out. */
export function isTopOfScale(outcome: GradeOutcome | null): boolean {
  return outcome !== null && outcome.kind === 'top-of-scale'
}

/** Why an outcome shows no grade, as a sentence; null for a graded one. */
export function notGradedText(outcome: GradeOutcome): string | null {
  if (outcome.kind === 'graded') return null
  return outcome.kind === 'top-of-scale' ? TOP_OF_SCALE_TEXT : outcome.reason
}

/** Both sports' grades at the headline duration, each at its own date. */
export function headlineGrades(result: AnalysisResult, profile: AgeProfile): HeadlineGrades {
  return {
    run: sportGrade(result, 'run', HEADLINE_DURATION_S, profile),
    ride: sportGrade(result, 'ride', HEADLINE_DURATION_S, profile),
  }
}

/**
 * The headline's comparison, left out when the ride is at the top of the scale. The energy comparison is taken
 * from the same ride, so it would carry into the balance a ride that the grades leave out.
 */
export function unlessRideAtTop<T>(pick: T | null, ride: GradeOutcome | null): T | null {
  return isTopOfScale(ride) ? null : pick
}

/**
 * The sex the grades are for, when either sport shows a grade at the headline duration; null when
 * neither does, or the profile is missing. A page cites its standard only with this sex in hand.
 * A ride counts only when rideShown: a ride's grade waits for the weight, so a page without one
 * passes false and does not cite a standard for a grade it is not showing.
 */
export function gradedSexOf(
  headline: HeadlineGrades | null,
  profile: AgeProfile | null,
  rideShown = true,
): Sex | null {
  if (headline === null || profile === null) return null
  const shown = headline.run.kind === 'graded' || (rideShown && headline.ride.kind === 'graded')
  return shown ? profile.sex : null
}

export * from './gradeNotes'

/**
 * The level a grade names: its band, or "Recreational to Local" when a ride's range crosses a band
 * boundary, so the range's two ends are both named.
 */
export function gradeLevelText(grade: SportGrade): string {
  const { centre, range } = grade
  return range && range.low.level !== range.high.level
    ? `${range.low.level} to ${range.high.level}`
    : centre.level
}

/** A ride's range as whole percents, such as "63–71%". */
export function gradeRangeText(range: { low: Grade; high: Grade }): string {
  return `${wholeGrade(range.low.grade)}–${formatGrade(range.high.grade)}`
}

/**
 * A grade on the share card's hero: its centre level and whole percent, and the effort it grades,
 * such as "Local · 64% on best 20 min". A ride names its centre level only, so the line fits two lines
 * of the card; the page's grade line gives the range. The card's threshold label already says the
 * figure is estimated, so the line does not repeat it.
 */
export function heroGradeLine(grade: SportGrade): string {
  return `${grade.centre.level} · ${formatGrade(grade.centre.grade)} on best ${HEADLINE_LABEL}`
}

/**
 * Where a grade sentence is written. A card says a ride is estimated; a record says it is graded
 * through its running equivalent, so a row on its own still says how the grade was reached. A row in a
 * list that says that once under the list reads only its level, so the lead is left off the row.
 */
export type GradeContext = 'card' | 'record' | 'row'

/** A grade sentence in parts, so each can be set apart: the level and percent stay on one line. */
export interface GradeParts {
  /** "Estimated" for a ride, or "Estimated through its running equivalent" on a record; else null. */
  lead: string | null
  level: string
  /** The centre as a whole percent, such as "64%". */
  value: string
  /** A ride's range as whole percents, such as "63–71%"; null for a run. */
  range: string | null
}

/** The lead a ride's grade carries in a context, or null where the context leaves it off. */
function leadOf(sport: Sport, where: GradeContext): string | null {
  if (sport !== 'ride') return null
  if (where === 'card') return 'Estimated'
  return where === 'record' ? 'Estimated through its running equivalent' : null
}

/**
 * A grade as the cards and records write it, in parts. A run is read as recorded: "Local · 67%". A
 * ride is estimated through its running equivalent: "Estimated · Local · 67% (63–71%)".
 */
export function gradeParts(
  sport: Sport,
  grade: SportGrade,
  where: GradeContext = 'card',
): GradeParts {
  return {
    lead: leadOf(sport, where),
    level: gradeLevelText(grade),
    value: formatGrade(grade.centre.grade),
    range: grade.range ? gradeRangeText(grade.range) : null,
  }
}

/**
 * A run's grade at a distance record, read as recorded: the distance over its time, graded at the age
 * on the day it was run. A distance with no standard, under a mile, is a gap.
 */
export function distanceGrade(
  distanceM: number,
  seconds: number,
  startMs: number,
  profile: AgeProfile,
): GradeOutcome {
  const ageAndSex = ageAndSexAt(profile, startMs)
  if (ageAndSex === null) return gap(AGE_RANGE_TEXT)
  const centre = gradeAtSpeed(distanceM / seconds, seconds, ageAndSex)
  if (centre === null) return gap(NO_STANDARD_TEXT)
  return { kind: 'graded', age: ageAndSex.age, grade: { centre, range: null } }
}

/** A run under a mile has no standard, so a record row names that rather than the full reason. */
export const NO_STANDARD_RECORD_TEXT: Record<Sport, string> = {
  run: 'No age standard under 1 mile',
  ride: 'No age standard for this duration',
}

/** Whether a record's gap is the one a run under a mile, or a ride with no standard, has. */
export function isNoStandardGap(outcome: GradeOutcome | null): boolean {
  return outcome !== null && outcome.kind === 'gap' && outcome.reason === NO_STANDARD_TEXT
}

/**
 * A record's gap as a short line for its row, such as "No age standard under 1 mile", or null when
 * the record is graded. Any other reason is kept as it is.
 */
export function gapRecordText(sport: Sport, outcome: GradeOutcome): string | null {
  if (outcome.kind === 'graded') return null
  if (outcome.kind === 'top-of-scale') return TOP_OF_SCALE_SHORT
  return isNoStandardGap(outcome) ? NO_STANDARD_RECORD_TEXT[sport] : notGradedText(outcome)
}

/**
 * The notes a list of records says once under it, rather than on each row: a ride's lead when a record
 * is graded through its running equivalent, and the no-standard gap when a record has none. Each is
 * named once, whatever the number of rows it would have repeated on.
 */
export function listedGradeNotes(
  sport: Sport,
  outcomes: readonly (GradeOutcome | null)[],
): string[] {
  const notes: string[] = []
  const lead = leadOf(sport, 'record')
  if (lead !== null && outcomes.some((outcome) => outcome?.kind === 'graded')) notes.push(lead)
  if (outcomes.some(isNoStandardGap)) notes.push(NO_STANDARD_RECORD_TEXT[sport])
  return notes
}

import type { Dated } from '@rca/core/calendar'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  FIRST_GRADED_AGE,
  GRADE_LEVELS,
  LAST_GRADED_AGE,
  ageAndSexAt,
  gradeAtSpeed,
  gradeEffort,
} from '@rca/core/grade'
import type { AgeProfile, EffortGrade, GapKind, Grade, Sex, SportGrade } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Interval, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { formatGrade, wholeGrade } from './gradeFormat'
import { curveOf } from './records'

// The grade path itself is in core, where the history grades its years by it too.
export { ageAndSexAt, gradeAtSpeed, rideGradeFromSpeeds } from '@rca/core/grade'
export type { AgeAndSex, AgeProfile, Grade, RideGradeRead, SportGrade } from '@rca/core/grade'

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

/** Either a grade, with the age it was taken at, or the reason there is none to show. */
export type GradeOutcome = Exclude<EffortGrade, { kind: 'gap' }> | { kind: 'gap'; reason: string }

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

function gap(reason: string): GradeOutcome {
  return { kind: 'gap', reason }
}

/** The words for why an effort has no grade. */
const GAP_TEXT: Record<GapKind, string> = {
  'no-date': NO_DATE_TEXT,
  'age-range': AGE_RANGE_TEXT,
  'no-standard': NO_STANDARD_TEXT,
}

/** The start (with its day shift) of the activity with this id, or null when it is not among the result's activities. */
function startOf(result: AnalysisResult, activityId: string | null): Dated | null {
  if (activityId === null) return null
  return result.activities.find((activity) => activity.id === activityId) ?? null
}

/**
 * The flat running speed that costs the same as a sport's best effort at durationS: a run's pace as recorded, and a
 * ride's running equivalent from the result, null when it has none at that length.
 */
const SPEED_OF: Record<
  Sport,
  (result: AnalysisResult, durationS: number, value: number) => Interval | null
> = {
  run: (_result, _durationS, value) => {
    const speed = metabolicToFlatSpeed(value)
    return { p05: speed, p50: speed, p95: speed }
  },
  ride: (result, durationS) =>
    result.equivalents.find((candidate) => candidate.durationS === durationS)?.runSpeed ?? null,
}

/**
 * A sport's age grade at durationS, taken at the age on the date of the activity that set the best
 * effort there. A ride's equivalent comes from its own best ride at that duration, so a ride is
 * dated by that ride. A ride at the top of the age tables is its own outcome, and any other lack of a grade
 * comes back as the reason. The grading itself is core's `gradeEffort`, which the history grades its years by.
 */
export function sportGrade(
  result: AnalysisResult,
  sport: Sport,
  durationS: number,
  profile: AgeProfile,
): GradeOutcome {
  const point = curveOf(result, sport).find((candidate) => candidate.durationS === durationS)
  if (point === undefined || !Number.isFinite(point.value)) return gap(NEEDS_EFFORT_TEXT)
  const effort = {
    speed: SPEED_OF[sport](result, durationS, point.value),
    started: startOf(result, point.activityId),
  }
  const graded = gradeEffort(sport, effort, durationS, profile)
  return graded.kind === 'gap' ? gap(GAP_TEXT[graded.why]) : graded
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

import { NO_STANDARD_RECORD_TEXT } from './gradeNotes'

export * from './gradeNotes'

/**
 * The level a grade names, or null when its range crosses a band boundary: a level is named only when the
 * whole range sits in one band, so a ride that could be in either shows its number and range alone.
 */
export function gradeLevelText(grade: SportGrade): string | null {
  const { centre, range } = grade
  return range && range.low.level !== range.high.level ? null : centre.level
}

/** A ride's range as whole percents, low to high, such as "63 to 71". */
export function gradeRangeText(range: { low: Grade; high: Grade }): string {
  return `${wholeGrade(range.low.grade)} to ${wholeGrade(range.high.grade)}`
}

/**
 * A grade on the share card's hero: its level and whole percent, and the effort it grades, such as
 * "Local · 64% on best 20 min". A grade with no level to name shows its number and range alone, as the
 * page does: "64% (63 to 71) on best 20 min". The card's threshold label already says the figure is
 * estimated, so the line does not repeat it.
 */
export function heroGradeLine(grade: SportGrade): string {
  const { centre, range } = grade
  const level = gradeLevelText(grade)
  const figure = formatGrade(centre.grade)
  if (level !== null) return `${level} · ${figure} on best ${HEADLINE_LABEL}`
  const spread = range === null ? '' : ` (${gradeRangeText(range)})`
  return `${figure}${spread} on best ${HEADLINE_LABEL}`
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
  /** The level the whole range sits in; null where a ride's range crosses a band, so the number and range stand alone. */
  level: string | null
  /** The centre as a whole percent, such as "64%". */
  value: string
  /** A ride's range as whole percents, low to high, such as "63 to 71"; null for a run. */
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
 * ride is estimated through its running equivalent: "Estimated · Local · 67% (63 to 71)".
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
  started: number | Dated,
  profile: AgeProfile,
): GradeOutcome {
  const ageAndSex = ageAndSexAt(profile, started)
  if (ageAndSex === null) return gap(AGE_RANGE_TEXT)
  const centre = gradeAtSpeed(distanceM / seconds, seconds, ageAndSex)
  if (centre === null) return gap(NO_STANDARD_TEXT)
  return { kind: 'graded', age: ageAndSex.age, grade: { centre, range: null } }
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
  return isNoStandardGap(outcome) ? NO_STANDARD_RECORD_TEXT[sport]([]) : notGradedText(outcome)
}

/**
 * The notes a list of records says once under it, rather than on each row: a ride's lead when a record
 * is graded through its running equivalent, and the no-standard gap when a record has none, which names the
 * records it is for (`labels`, one for each outcome) since it sits apart from their rows. Each is named once,
 * whatever the number of rows it would have repeated on.
 */
export function listedGradeNotes(
  sport: Sport,
  outcomes: readonly (GradeOutcome | null)[],
  labels: readonly string[],
): string[] {
  const notes: string[] = []
  const lead = leadOf(sport, 'record')
  if (lead !== null && outcomes.some((outcome) => outcome?.kind === 'graded')) notes.push(lead)
  const ungraded = labels.filter((_, i) => isNoStandardGap(outcomes[i] ?? null))
  if (ungraded.length > 0) notes.push(NO_STANDARD_RECORD_TEXT[sport](ungraded))
  return notes
}

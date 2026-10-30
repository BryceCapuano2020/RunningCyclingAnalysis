import type { Sport } from '@rca/core/types'
import {
  AGE_RANGE_TEXT,
  HEADLINE_LABEL,
  IMPLAUSIBLE_RIDE_SHORT,
  IMPLAUSIBLE_RIDE_TEXT,
  NEEDS_EFFORT_TEXT,
  NO_DATE_TEXT,
  NO_STANDARD_TEXT,
} from '../grades'
import { gradeLevelText } from '../grades'
import type { AgeGap, GradeOutcome } from '../grades'
import { wholeGrade } from '../gradeFormat'
import { SPORT_ORDER, SPORT_PLURAL } from '../sports'

/** One sport's line under the meter: its grade and level, or in a few words what the grade is waiting for. */
export interface LevelRow {
  sport: Sport
  /** The age grade as the tiles print it, such as "67%"; null while the sport has no grade to show. */
  grade: string | null
  /** The level the grade names, or the two a ride's range crosses; null with the grade. */
  level: string | null
  /** What is missing, in a few words; null when the sport is graded. */
  missing: string | null
}

/** The levels under the meter: a line for each sport, or one line when both wait for the same thing. */
export interface BalanceLevelsModel {
  rows: LevelRow[]
  /** What both sports wait for, said once, in place of the rows. */
  note: string | null
}

/** The reason a grade is missing, in a few words. The grade's own sentence is the key. */
const SHORT_REASON: Record<string, string> = {
  [NEEDS_EFFORT_TEXT]: `Needs a best ${HEADLINE_LABEL} effort`,
  [NO_DATE_TEXT]: 'Best effort has no date',
  [AGE_RANGE_TEXT]: AGE_RANGE_TEXT.replace(/\.$/, ''),
  [NO_STANDARD_TEXT]: 'No age standard for this effort',
  [IMPLAUSIBLE_RIDE_TEXT]: IMPLAUSIBLE_RIDE_SHORT,
}

/** The line for a sport with no activities in the period, per sport. */
const NONE_IN_PERIOD: Record<Sport, string> = {
  run: `No ${SPORT_PLURAL.run} in this period`,
  ride: `No ${SPORT_PLURAL.ride} in this period`,
}

function missingFor(
  sport: Sport,
  outcome: GradeOutcome | null,
  input: { inPeriod: Record<Sport, number>; missingAge: AgeGap | null },
): string {
  if (input.inPeriod[sport] === 0) return NONE_IN_PERIOD[sport]
  if (outcome?.kind === 'gap') return SHORT_REASON[outcome.reason] ?? outcome.reason
  // No outcome: the grades wait for the year of birth and sex, or for the weight a ride's grade needs.
  return input.missingAge === null ? 'Needs your weight' : `Needs your ${input.missingAge}`
}

/**
 * The levels under the meter, from the grades the page already holds: each sport's age grade in whole percent
 * and its level, as the tiles print them. A sport with no grade says what it is missing; when both are missing
 * the same thing, it is said once.
 */
export function balanceLevels(input: {
  grades: Record<Sport, GradeOutcome | null>
  /** The sports to show, in the order they are shown: both on the balance, the one on file when the other has no activities. */
  sports?: readonly Sport[]
  inPeriod: Record<Sport, number>
  missingAge: AgeGap | null
}): BalanceLevelsModel {
  const { grades, sports = SPORT_ORDER, inPeriod, missingAge } = input
  const rows = sports.map((sport): LevelRow => {
    const outcome = grades[sport]
    if (outcome?.kind === 'graded') {
      return {
        sport,
        grade: `${wholeGrade(outcome.grade.centre.grade)}%`,
        level: gradeLevelText(outcome.grade),
        missing: null,
      }
    }
    return {
      sport,
      grade: null,
      level: null,
      missing: missingFor(sport, outcome, { inPeriod, missingAge }),
    }
  })
  const [first] = rows
  const same =
    rows.length > 1 && rows.every((row) => row.missing !== null && row.missing === first?.missing)
  return same ? { rows: [], note: first?.missing ?? null } : { rows, note: null }
}

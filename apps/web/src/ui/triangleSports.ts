import { LIFTS } from '@rca/core/lift'
import type { GradedLift, LiftCornerGrade } from '@rca/core/lift'
import { NO_TRIANGLE_GRADES } from '@rca/core/standing'
import type { TriangleGrade, TriangleGrades, TriangleSport } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { TOP_OF_SCALE_SHORT } from './grades'
import type { GradeOutcome } from './grades'
import { hrefFor } from './route'
import { SPORT_NOUN, SPORT_TITLE } from './sports'

/** The sport as the word that opens a sentence and labels a corner of the level triangle: Running, Cycling, Lifting. */
export const TRIANGLE_TITLE: Record<TriangleSport, string> = {
  ...SPORT_TITLE,
  lift: 'Lifting',
}

/** The sport as the noun inside a sentence, lower case. */
export const TRIANGLE_NOUN: Record<TriangleSport, string> = { ...SPORT_NOUN, lift: 'lifting' }

/** Where a corner links: the sport's page, which says what it needs. */
export const TRIANGLE_HREF: Record<TriangleSport, string | null> = {
  run: hrefFor({ page: 'run' }),
  ride: hrefFor({ page: 'ride' }),
  lift: hrefFor({ page: 'lift' }),
}

/** What a corner with no grade says under its name. */
export const NO_GRADE_TEXT = 'No grade yet'

/** The lifts' names in a corner's note. */
const LIFT_WORD: Record<GradedLift, string> = {
  squat: 'squat',
  bench: 'bench',
  deadlift: 'deadlift',
}

/** "Squat and bench", "Deadlift only": which of the three lifts a lifting corner holds. */
export function coveredText(lifts: readonly GradedLift[]): string {
  const words = lifts.map((lift) => LIFT_WORD[lift])
  const text =
    words.length === 1 ? `${words[0]} only` : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * The figure's grades, and per corner a note: for a missing grade, the reason the plain text does not give; for a graded lifting
 * corner from fewer than three lifts, which lifts it holds.
 */
export interface TriangleView {
  grades: TriangleGrades
  notes: Partial<Record<TriangleSport, string>>
}

/** A figure with no grades, as the page shows it before any sport is graded. */
export const EMPTY_TRIANGLE: TriangleView = { grades: NO_TRIANGLE_GRADES, notes: {} }

function cornerOf(outcome: GradeOutcome | null): TriangleGrade {
  return outcome?.kind === 'graded' ? { kind: 'graded', grade: outcome.grade } : { kind: 'gap' }
}

/**
 * The level triangle's grades from the grades the page holds, and lifting's share-of-total grade when the athlete has a graded
 * lift (docs/design/lift-grade.md). A ride at the top of the age tables is a gap, and says so in its corner; a lift at the top of
 * its scale is drawn at 100%.
 */
export function triangleViewOf(
  grades: Record<Sport, GradeOutcome | null>,
  lift: LiftCornerGrade | null = null,
): TriangleView {
  const notes: TriangleView['notes'] = {}
  if (grades.ride?.kind === 'top-of-scale') notes.ride = TOP_OF_SCALE_SHORT
  // A corner from fewer than the three lifts says which it holds, since the Big three row grades each lift on its own.
  if (lift?.kind === 'graded' && lift.lifts.length < LIFTS.length)
    notes.lift = coveredText(lift.lifts)
  return {
    grades: {
      run: cornerOf(grades.run),
      ride: cornerOf(grades.ride),
      lift: lift?.kind === 'graded' ? { kind: 'graded', grade: lift.grade } : { kind: 'gap' },
    },
    notes,
  }
}

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

/**
 * Where a corner links: the sport's page, which says what it needs. Lifting has no page yet, so its corner is plain text until it
 * has one; the corner is a link wherever this has an address.
 */
export const TRIANGLE_HREF: Record<TriangleSport, string | null> = {
  run: hrefFor({ page: 'run' }),
  ride: hrefFor({ page: 'ride' }),
  lift: null,
}

/** What a corner with no grade says under its name. */
export const NO_GRADE_TEXT = 'No grade yet'

/** The figure's grades, and the words for a corner whose grade is missing for a reason the plain text does not give. */
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
 * The level triangle's grades from the grades the page holds. Lifting has no grade yet, so its corner is always a gap; a ride at the
 * top of the age tables is a gap too, and says so in its corner.
 */
export function triangleViewOf(grades: Record<Sport, GradeOutcome | null>): TriangleView {
  return {
    grades: { run: cornerOf(grades.run), ride: cornerOf(grades.ride), lift: { kind: 'gap' } },
    notes: grades.ride?.kind === 'top-of-scale' ? { ride: TOP_OF_SCALE_SHORT } : {},
  }
}

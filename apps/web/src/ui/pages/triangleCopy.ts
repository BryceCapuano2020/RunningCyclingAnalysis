import { comparedGrades, triangleReading } from '@rca/core/standing'
import type { TriangleReading, TriangleSport } from '@rca/core/standing'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { BalanceReading } from '../components/balanceScale'
import { energySummary } from '../components/headlineText'
import { plural } from '../components/plural'
import { TRIANGLE_NOUN, TRIANGLE_TITLE } from '../triangleSports'
import type { TriangleView } from '../triangleSports'
import { titleParts } from './balanceCopy'

/** What the grades are of, with a no-break space, so "at threshold" never parts across a line. */
const AT = 'at threshold'

/** "running", "running and cycling", "running, cycling and lifting". */
function listOf(sports: readonly TriangleSport[]): string {
  const nouns = sports.map((sport) => TRIANGLE_NOUN[sport])
  const last = nouns.pop()
  return nouns.length === 0 ? (last ?? '') : `${nouns.join(', ')} and ${last}`
}

/** The headline split at the sports it names, so each can be marked: the words before them, then the sports. */
export interface TriangleTitle {
  lead: string
  /** The sports the balance leans toward, in the order the sentence names them; empty for a level balance. */
  sports: TriangleSport[]
}

/**
 * The headline of a balance of two or more graded sports, or null with fewer. A balance that leans names the sports it leans toward
 * last; a level one is one phrase naming every graded sport. With run and ride it is the words the page has always had.
 */
export function triangleTitle(reading: TriangleReading): TriangleTitle | null {
  if (reading.graded.length < 2) return null
  if (reading.even) {
    return { lead: `Your ${listOf(reading.graded)} are in balance`, sports: [] }
  }
  return { lead: 'Your balance leans toward ', sports: reading.leaders }
}

/** The headline as plain text, the sentence the page and the share card print. */
export function triangleTitleText(title: TriangleTitle): string {
  return `${title.lead}${listOf(title.sports)}`
}

/**
 * The one line under the headline, or null with fewer than two graded. Three graded sports state the highest over the lowest; two
 * state who grades higher, at threshold, as the page always has; a level three say how near they sit.
 */
export function triangleLine(reading: TriangleReading): string | null {
  const { graded, higher, lower, lead, even, spread } = reading
  if (higher === null || lower === null || lead === null) return null
  const points = Math.abs(Math.round(lead.centre))
  if (graded.length === 2) {
    const [first, second] = graded
    if (points === 0 && first !== undefined && second !== undefined) {
      return `${TRIANGLE_TITLE[first]} and ${TRIANGLE_NOUN[second]} grade the same ${AT}.`
    }
    return `${TRIANGLE_TITLE[higher]} grades ${plural(points, 'point')} higher ${AT}.`
  }
  if (even) {
    return spread === 0
      ? 'The three grade the same.'
      : `The three sit within ${plural(spread, 'point')} of each other.`
  }
  return `${TRIANGLE_TITLE[higher]} grades ${plural(points, 'point')} higher than ${TRIANGLE_NOUN[lower]}.`
}

/** The title when the triangle itself shows the lean: the figure says which way, so the words only name it (owner, 10 Nov 2026). */
export const FIGURE_TITLE: TriangleTitle = { lead: 'Your athletic balance', sports: [] }

/**
 * The answer in words, for the page, the share card and the landing example alike: the headline and the one line under it. When two
 * or more sports are graded the triangle shows the lean and the gap, so the title is `FIGURE_TITLE` and there is no line. An energy balance draws no grades, so it keeps its own headline and sentence.
 */
export function triangleAnswer(
  reading: BalanceReading,
  view: TriangleView,
  durationS: number | undefined,
): { title: TriangleTitle; line: string | null } {
  const graded = triangleReading(comparedGrades(view.grades))
  if (reading.unit === 'points') {
    return triangleTitle(graded) === null
      ? { title: titleParts(reading), line: triangleLine(graded) }
      : { title: FIGURE_TITLE, line: null }
  }
  return {
    title: titleParts(reading),
    line: energySummary(reading, durationS ?? HEADLINE_DURATION_S),
  }
}

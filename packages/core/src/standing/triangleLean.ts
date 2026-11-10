import type { SportGrade } from '../grade'
import { balanceLead, leanOfLead, wholePercent } from './lead'
import type { BalanceLead } from './lead'
import { TRIANGLE_SPORTS } from './triangle'
import type { TriangleGrades, TriangleSport } from './triangle'

/**
 * Which way the three sports lean, from the grades that exist. The rule is `leanOfLead`'s, applied to the highest and the lowest
 * graded sport: with two graded sports that is exactly the pair's own lead, so the figures are the ones the page already states.
 */
export interface TriangleReading {
  /** The graded sports, in axis order. */
  graded: TriangleSport[]
  /** The sport that grades higher and the one it grades higher than; null with fewer than two graded. */
  higher: TriangleSport | null
  lower: TriangleSport | null
  /** The higher sport's lead over the lower in whole points, with its 90% range; null with fewer than two graded. */
  lead: BalanceLead | null
  /** The sports the balance leans toward: the highest, and any other within the even rule of it. Empty when even. */
  leaders: TriangleSport[]
  /** Two or more graded and the highest and lowest are within the even rule of each other. */
  even: boolean
  /** The whole points between the highest and the lowest graded sport; 0 with fewer than two. */
  spread: number
}

/** A lead of exactly this size in whole points, as a lead with no range, for the even rule. */
function isLevel(points: number): boolean {
  return leanOfLead({ centre: points, low: points, high: points }) === 'even'
}

/**
 * The reading of the grades. With two graded sports the lead is the first's over the second's in axis order (the sign says which
 * is higher, as a pair's lead does); with three it is the highest's over the lowest's. Ties keep axis order.
 */
export function triangleReading(grades: TriangleGrades): TriangleReading {
  const graded = TRIANGLE_SPORTS.filter((sport) => grades[sport].kind === 'graded')
  const centreOf = (sport: TriangleSport): number => {
    const outcome = grades[sport]
    return outcome.kind === 'graded' ? wholePercent(outcome.grade.centre.grade) : 0
  }
  const gradeOf = (sport: TriangleSport): SportGrade => {
    const outcome = grades[sport]
    if (outcome.kind !== 'graded') throw new Error(`${sport} has no grade`)
    return outcome.grade
  }
  const [first, second] = graded
  if (first === undefined || second === undefined) {
    return { graded, higher: null, lower: null, lead: null, leaders: [], even: false, spread: 0 }
  }
  // Highest first; the sort is stable, so equal grades keep axis order.
  const byGrade = [...graded].sort((a, b) => centreOf(b) - centreOf(a))
  const [high, low] =
    graded.length === 2 ? [first, second] : [byGrade[0]!, byGrade[byGrade.length - 1]!]
  const lead = balanceLead(gradeOf(high), gradeOf(low))
  const spread = centreOf(byGrade[0]!) - centreOf(byGrade[byGrade.length - 1]!)
  const even = isLevel(spread)
  // With two sports the pair's own sign says which is higher, so a lead of 0 reads from the first, as it always has.
  const higher = graded.length === 2 && lead.centre < 0 ? second : high
  const lower = higher === high ? low : high
  const top = centreOf(byGrade[0]!)
  const leaders = even
    ? []
    : graded.length === 2
      ? [higher]
      : graded.filter((sport) => isLevel(top - centreOf(sport)))
  return { graded, higher, lower, lead, leaders, even, spread }
}

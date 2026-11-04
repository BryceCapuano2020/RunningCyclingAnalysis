import type { SportGrade } from '../grade'
import { gradePercent } from '../grade'
import type { PairLead, Sport } from '../types'

/** Which way a balance leans: toward one sport, or even when the two are level. */
export type Lean = Sport | 'even'

/** A lead on a scale: its centre and the low and high ends of its range. A positive lead favours running (the first of the pair). */
export type Lead = PairLead

/** A lead within this many whole points of grade, or whole percent of energy, is level. */
export const LEVEL_BAND = 2

/** A lead with the lean it gives. */
export interface BalanceLead extends Lead {
  lean: Lean
}

/** A grade as the whole percent every surface shows, floored so it never reads above its level band. */
export function wholePercent(grade: number): number {
  return Math.floor(gradePercent(grade) ?? 0)
}

/** A lead's centre in whole units, rounded by size so a lead of −2.5 and one of +2.5 are the same size. */
export function wholeCentre(lead: Lead): number {
  return Math.sign(lead.centre) * Math.round(Math.abs(lead.centre))
}

/**
 * The lean of a lead: toward the sport its best estimate favours, and even only when that estimate is within LEVEL_BAND of zero.
 * The range does not decide it. It is stated beside the estimate, so a lead of 9 points reads as 9 points whether its range
 * reaches zero or not.
 */
export function leanOfLead(lead: Lead): Lean {
  const centre = wholeCentre(lead)
  if (Math.abs(centre) <= LEVEL_BAND) return 'even'
  return centre > 0 ? 'run' : 'ride'
}

/**
 * The lean by the range alone: toward a sport when the whole range is on its side of zero, else even. It says where one
 * sport's grade is outside the other's range, which the grade profile reports.
 */
export function leanOfRange(lead: Lead): Lean {
  if (lead.low > 0) return 'run'
  if (lead.high < 0) return 'ride'
  return 'even'
}

/** A sport's grade in whole percent, with the ends of its range. A grade with no range is a point. */
function bounds(sport: SportGrade): Lead {
  const centre = wholePercent(sport.centre.grade)
  if (sport.range === null) return { centre, low: centre, high: centre }
  return {
    centre,
    low: wholePercent(sport.range.low.grade),
    high: wholePercent(sport.range.high.grade),
  }
}

/**
 * The first sport's age-grade lead over the second's in whole points, the difference of the grades the cards show. Its range
 * combines the two sports' ranges in quadrature: the lead's distance below its centre is the root of the sum of the squares of
 * how far the first sport's low and the second's high sit from their centres, and above it likewise. Two ranges are not both
 * at their worst at once, which the sum of their ends would assume. The ends are whole points.
 */
export function balanceLead(first: SportGrade, second: SportGrade): BalanceLead {
  const [a, b] = [bounds(first), bounds(second)]
  const centre = a.centre - b.centre
  const below = Math.hypot(a.centre - a.low, b.high - b.centre)
  const above = Math.hypot(a.high - a.centre, b.centre - b.low)
  const lead: Lead = { centre, low: Math.round(centre - below), high: Math.round(centre + above) }
  return { ...lead, lean: leanOfLead(lead) }
}

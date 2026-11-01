import { leanOfLead, type Lead, type Lean } from '../domain/lean'
import type { HeadlineGrades, SportGrade } from './grades'
import { wholeGrade } from './gradeFormat'
import { BALANCE_PAIR } from './sports'

/** The first sport's age-grade lead over the second's, in whole points, with its range and the lean it gives. */
export interface BalanceGap extends Lead {
  lean: Lean
}

/** A sport's grade in whole percent, with the ends of its range. A grade with no range is a point. */
function bounds(sport: SportGrade): Lead {
  const centre = wholeGrade(sport.centre.grade)
  if (sport.range === null) return { centre, low: centre, high: centre }
  return {
    centre,
    low: wholeGrade(sport.range.low.grade),
    high: wholeGrade(sport.range.high.grade),
  }
}

/**
 * The first sport's age-grade lead over the second's in whole points. A run is one activity's estimate
 * and has no range; a ride is estimated through its running equivalent, and its range is the gap's
 * range. Both sides are whole percents, so the gap is the difference of the grades the cards show.
 */
export function balanceGap(first: SportGrade, second: SportGrade): BalanceGap {
  const firstBounds = bounds(first)
  const secondBounds = bounds(second)
  const lead: Lead = {
    centre: firstBounds.centre - secondBounds.centre,
    low: firstBounds.low - secondBounds.high,
    high: firstBounds.high - secondBounds.low,
  }
  return { ...lead, lean: leanOfLead(lead) }
}

/**
 * The gap when both sports are graded at the headline duration, or null. Without both grades the
 * balance falls back to the energy ratio.
 */
export function gapOfHeadline(headline: HeadlineGrades): BalanceGap | null {
  const [first, second] = BALANCE_PAIR
  const one = headline[first]
  const other = headline[second]
  if (one.kind !== 'graded' || other.kind !== 'graded') return null
  return balanceGap(one.grade, other.grade)
}

import type { HeadlineGrades, SportGrade } from './grades'
import { wholeGrade } from './gradeFormat'

/** Which way a balance leans: toward one sport, or even when its range spans zero. */
export type Lean = 'run' | 'ride' | 'even'

/**
 * A lead on a scale: its centre and the low and high ends of its range. A positive lead favours
 * running, whatever the scale measures.
 */
export interface Lead {
  centre: number
  low: number
  high: number
}

/** Running's age-grade lead over cycling, in whole points, with its range and the lean it gives. */
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
 * The lean of a lead. It leans toward a sport when its whole range is on that sport's side of zero,
 * and it is even when the range touches or spans zero: the balance is not told apart from even.
 */
export function leanOfLead(lead: Lead): Lean {
  if (lead.low > 0) return 'run'
  if (lead.high < 0) return 'ride'
  return 'even'
}

/**
 * Running's age-grade lead over cycling in whole points. A run is one activity's estimate and has
 * no range; a ride is estimated through its running equivalent, and its range is the gap's range.
 * Both sides are whole percents, so the gap is the difference of the grades the cards show.
 */
export function balanceGap(run: SportGrade, ride: SportGrade): BalanceGap {
  const runBounds = bounds(run)
  const rideBounds = bounds(ride)
  const lead: Lead = {
    centre: runBounds.centre - rideBounds.centre,
    low: runBounds.low - rideBounds.high,
    high: runBounds.high - rideBounds.low,
  }
  return { ...lead, lean: leanOfLead(lead) }
}

/**
 * The gap when both sports are graded at the headline duration, or null. Without both grades the
 * balance falls back to the energy ratio.
 */
export function gapOfHeadline(headline: HeadlineGrades): BalanceGap | null {
  if (headline.run.kind !== 'graded' || headline.ride.kind !== 'graded') return null
  return balanceGap(headline.run.grade, headline.ride.grade)
}

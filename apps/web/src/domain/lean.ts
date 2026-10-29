/** Which way a balance leans: toward one sport, or even when the two are level. */
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

/** A lead within this many whole points of grade, or whole percent of energy, is level. */
export const LEVEL_BAND = 2

/** A lead's centre in whole units, rounded by size so a lead of −2.5 and one of +2.5 are the same size. */
export function wholeCentre(lead: Lead): number {
  return Math.sign(lead.centre) * Math.round(Math.abs(lead.centre))
}

/**
 * The lean of a lead: toward the sport its best estimate favours, and even only when that estimate is
 * within LEVEL_BAND of zero. The range does not decide it. It is stated beside the estimate, so a
 * lead of 9 points reads as 9 points whether its range reaches zero or not.
 */
export function leanOfLead(lead: Lead): Lean {
  const centre = wholeCentre(lead)
  if (Math.abs(centre) <= LEVEL_BAND) return 'even'
  return centre > 0 ? 'run' : 'ride'
}

/**
 * The lean by the range alone: toward a sport when the whole range is on its side of zero, else even.
 * It says where one sport's grade is outside the other's range, which the grade profile reports.
 */
export function leanOfRange(lead: Lead): Lean {
  if (lead.low > 0) return 'run'
  if (lead.high < 0) return 'ride'
  return 'even'
}

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

/**
 * The lean of a lead. It leans toward a sport when its whole range is on that sport's side of zero,
 * and it is even when the range touches or spans zero: the balance is not told apart from even.
 */
export function leanOfLead(lead: Lead): Lean {
  if (lead.low > 0) return 'run'
  if (lead.high < 0) return 'ride'
  return 'even'
}

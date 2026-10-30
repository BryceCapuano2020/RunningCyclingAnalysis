import type { Sport } from '../types'

/**
 * What the change test says about one effort length: the later period's best is above what the two periods'
 * efforts, pooled and dealt out at random, would put it (`higher`), below it (`lower`), or inside it (`none`);
 * or the two periods do not hold enough efforts of this length to say (`untested`). Types only, so the page
 * can import them without loading the analysis.
 */
export type ChangeVerdict = 'higher' | 'lower' | 'none' | 'untested'

/** The test at one effort length, for one sport. */
export interface ChangeCall {
  durationS: number
  /** Efforts of this length in the selected period, and in the one before it. */
  now: number
  before: number
  /** ln(best now / best before), in the sport's comparison unit; null when either period has none. */
  observed: number | null
  /** The 5th and 95th percentile of the same ln ratio when the periods' efforts are dealt out at random; null when untested. */
  low: number | null
  high: number | null
  verdict: ChangeVerdict
}

/** The change test for both sports, one call per curve duration. */
export type ChangeEvidence = Record<Sport, ChangeCall[]>

/** The call at a duration, or undefined without evidence (all time has no period before) or at an unknown length. */
export function callAt(
  evidence: ChangeEvidence | null | undefined,
  sport: Sport,
  durationS: number,
): ChangeCall | undefined {
  return evidence?.[sport].find((call) => call.durationS === durationS)
}

/** The verdict at a duration; `untested` where there is no evidence to ask. */
export function verdictAt(
  evidence: ChangeEvidence | null | undefined,
  sport: Sport,
  durationS: number,
): ChangeVerdict {
  return callAt(evidence, sport, durationS)?.verdict ?? 'untested'
}

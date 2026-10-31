import type { Sport } from '../types'

/**
 * What the change test says about one effort length: the later period's best is above what the two periods'
 * efforts, pooled and dealt out at random, would put it (`higher`), below it (`lower`), or inside it (`none`);
 * or the two periods do not hold enough comparable efforts of this length to say (`untested`). Types only, so the
 * page can import them without loading the analysis.
 */
export type ChangeVerdict = 'higher' | 'lower' | 'none' | 'untested'

/**
 * Which readings a call was made from. A ride is tested on its power-meter readings when both periods have enough;
 * when they do not, the periods are compared only if neither holds a power-meter reading (all estimated). A mix that
 * differs between the periods is untested, since a change of source reads as a change of power.
 */
export type ChangeBasis = 'all' | 'measured' | 'estimated'

/** The test at one effort length, for one sport. */
export interface ChangeCall {
  durationS: number
  /** Efforts of this length in the selected period, and in the one before it (every one, whatever the basis). */
  now: number
  before: number
  basis: ChangeBasis
  /**
   * ln(best now / best before) in the compared unit (a run's flat speed, a ride's W/kg), from the readings of the
   * basis. Positive is a higher best. Null when either period has none, or the sources cannot be compared.
   */
  observed: number | null
  /** The 5th and 95th percentile of the same ln ratio when the periods' efforts are dealt out at random; null when untested. */
  low: number | null
  high: number | null
  /** The 2.5th and 97.5th percentile: the stricter band the headline surfaces hold a call to; null when untested. */
  strongLow: number | null
  strongHigh: number | null
  verdict: ChangeVerdict
}

/** The change test for both sports, one call per curve duration. */
export type ChangeEvidence = Record<Sport, ChangeCall[]>

/**
 * The bar a surface holds a call to: `record` is the 90% band (the best-effort list's rows, the dated bests), `headline`
 * the stricter 95% band (the Balance strip and a curve's title), where a call inside the first and outside the second
 * is no clear change.
 */
export type ChangeLevel = 'record' | 'headline'

/** The call at a duration, or undefined without evidence (all time has no period before) or at an unknown length. */
export function callAt(
  evidence: ChangeEvidence | null | undefined,
  sport: Sport,
  durationS: number,
): ChangeCall | undefined {
  return evidence?.[sport].find((call) => call.durationS === durationS)
}

/** Whether a called change also leaves the headline band. */
function isStrong(call: ChangeCall): boolean {
  const { observed, strongLow, strongHigh } = call
  if (observed === null || strongLow === null || strongHigh === null) return false
  return observed > strongHigh || observed < strongLow
}

/** The verdict of a call, held to a level: at `headline` a change that leaves only the record band is no clear change. */
export function verdictOfCall(
  call: ChangeCall | undefined,
  level: ChangeLevel = 'record',
): ChangeVerdict {
  if (call === undefined) return 'untested'
  return level === 'headline' && call.verdict !== 'untested' && !isStrong(call)
    ? 'none'
    : call.verdict
}

/** The verdict at a duration, held to a level; `untested` where there is no evidence to ask. */
export function verdictAt(
  evidence: ChangeEvidence | null | undefined,
  sport: Sport,
  durationS: number,
  level: ChangeLevel = 'record',
): ChangeVerdict {
  return verdictOfCall(callAt(evidence, sport, durationS), level)
}

/**
 * The smallest change, as a fraction of the earlier best, that would have been called at a level: the wider side of
 * its band. Null when the length is untested. A "none" says changes under this cannot be told apart here.
 */
export function detectableAt(
  call: ChangeCall | undefined,
  level: ChangeLevel = 'record',
): number | null {
  if (call === undefined) return null
  const [low, high] =
    level === 'headline' ? [call.strongLow, call.strongHigh] : [call.low, call.high]
  return low === null || high === null ? null : Math.max(Math.expm1(high), -Math.expm1(low))
}

/**
 * The widest smallest-detectable change a sentence may state, as a fraction of the earlier best. A band wider than this
 * (efforts that vary by half or more, as easy runs among hard ones do) tells the athlete nothing by its size, so the
 * sentence says the efforts vary too much instead of naming a number.
 */
export const MAX_STATED_RESOLUTION = 0.25

/** `detectableAt`, or null where the length is untested or the band is too wide to state (see MAX_STATED_RESOLUTION). */
export function statedResolutionAt(
  call: ChangeCall | undefined,
  level: ChangeLevel = 'record',
): number | null {
  const detectable = detectableAt(call, level)
  return detectable === null || detectable > MAX_STATED_RESOLUTION ? null : detectable
}

/**
 * Which way a call moved, from the compared unit and never from a displayed figure (watts at a changed weight can move
 * the other way): 1 for a higher best, -1 for a lower one, 0 for none or untested.
 */
export function directionOf(
  call: ChangeCall | undefined,
  level: ChangeLevel = 'record',
): -1 | 0 | 1 {
  if (call === undefined || call.observed === null) return 0
  const verdict = verdictOfCall(call, level)
  return verdict === 'higher' ? 1 : verdict === 'lower' ? -1 : 0
}

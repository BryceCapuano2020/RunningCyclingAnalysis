import { DURATIONS_S } from '@rca/core/constants'
import type { ChangeCall, ChangeEvidence, ChangeVerdict } from '@rca/core/change/types'

/** A call at a length with the verdict given and an observed ratio that agrees with it, for a test of how a call is worded. */
export function callOf(
  durationS: number,
  verdict: ChangeVerdict,
  { weak = false }: { weak?: boolean } = {},
): ChangeCall {
  const judged = verdict !== 'untested'
  // The record band is +-4%, the headline band +-6%. A weak call leaves the first and not the second.
  const size = weak ? 0.05 : 0.08
  const observed = !judged ? null : verdict === 'higher' ? size : verdict === 'lower' ? -size : 0.01
  return {
    durationS,
    now: judged ? 12 : 1,
    before: judged ? 12 : 1,
    basis: 'all',
    observed,
    low: judged ? -0.04 : null,
    high: judged ? 0.04 : null,
    strongLow: judged ? -0.06 : null,
    strongHigh: judged ? 0.06 : null,
    verdict,
  }
}

/**
 * Change evidence in which every length, in both sports, has the verdict given, for a test of how a verdict is worded.
 * `weak` makes a called change one that leaves the record band and not the headline band.
 */
export function changeOf(
  verdict: ChangeVerdict,
  over: Partial<Record<number, ChangeVerdict>> = {},
  options: { weak?: boolean } = {},
): ChangeEvidence {
  const calls = (): ChangeCall[] =>
    DURATIONS_S.map((durationS) => callOf(durationS, over[durationS] ?? verdict, options))
  return { run: calls(), ride: calls() }
}

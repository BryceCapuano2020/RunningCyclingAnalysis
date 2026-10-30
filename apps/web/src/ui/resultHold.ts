import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { effortHold } from './components/headlineNeed'
import { headlinePick } from './components/pickHeadline'
import type { HeadlinePick } from './components/pickHeadline'

/*
 * The one place that says whether a result's headline comparisons are held back for a reason about the evidence
 * itself, rather than for too little of it (that is the pick's own rule). Balance, the Method page, what moved, the share
 * card and the share button all read it, so no surface states a comparison another holds back. A later reason adds
 * itself above the ones here: 'updating' and 'partial-import' (D7, D12) take precedence over both.
 */

/** Why the comparison is held, most important first. */
export type HoldReason = 'implausible-ride' | 'effort'

export interface Hold {
  reason: HoldReason
  /** The sports it is about. */
  sports: Sport[]
  /** What is wrong, as a sentence. */
  text: string
  /** What lifts it, as a sentence. */
  action: string
}

/**
 * What else can hold the comparison, from outside the result. D6a feeds `implausibleRide` (a ride that works out to more
 * than a runner can do); until it does, nothing is passed and it holds nothing.
 */
export interface HoldInputs {
  implausibleRide?: { text: string; action: string } | null
}

/** The hold on a result's comparisons, or null when there is none. */
export function holdOf(result: AnalysisResult, inputs: HoldInputs = {}): Hold | null {
  const ride = inputs.implausibleRide ?? null
  if (ride !== null) return { reason: 'implausible-ride', sports: ['ride'], ...ride }
  const effort = effortHold(result)
  return effort === null ? null : { reason: 'effort', ...effort }
}

/** The headline's pick under the hold: none while the comparison is held, else the pick of the result. */
export function heldPick(
  result: AnalysisResult,
  inputs: HoldInputs = {},
): { hold: Hold | null; pick: HeadlinePick | null } {
  const hold = holdOf(result, inputs)
  return { hold, pick: hold === null ? headlinePick(result) : null }
}

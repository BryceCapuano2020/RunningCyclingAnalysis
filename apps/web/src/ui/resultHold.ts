import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { Period } from '@rca/core/period'
import { effortHold, heldAction, heldReason } from './components/headlineNeed'
import { headlineShortfall } from './components/pickHeadline'
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
 * What else can hold the comparison, from outside the result. `rideHoldInputs` (rideLeftOut.ts) builds both from a ride's
 * grade: `implausibleRide` when every ride's power is set aside as one no rider holds, which is a hold with a reason and
 * an action; `rideAtTop` when the ride is at the top of the age tables, which leaves it out of the comparison with no
 * fault to name, so the pick goes and the hold stays null.
 */
export interface HoldInputs {
  implausibleRide?: { text: string; action: string } | null
  rideAtTop?: boolean
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
  return { hold, pick: hold === null && inputs.rideAtTop !== true ? headlinePick(result) : null }
}

/**
 * What to tell a reader whose headline is not shown, and what lifts it: the hold's own text and action when there is one
 * (so the precedence of `holdOf` applies), else the count of activities a sport is short of or the 20 minute effort it lacks.
 * Too few activities comes first, since an effort cannot be asked of a sport with too little on file.
 */
export function heldTexts(
  result: AnalysisResult,
  period: Period | undefined,
  inputs: HoldInputs = {},
): { reason: string; action: string; hold: Hold | null } {
  const hold = holdOf(result, inputs)
  const short = headlineShortfall(result.activities)
  if (hold !== null && short.run === 0 && short.ride === 0) {
    return { reason: hold.text, action: hold.action, hold }
  }
  return { reason: heldReason(result, period), action: heldAction(result, period), hold: null }
}

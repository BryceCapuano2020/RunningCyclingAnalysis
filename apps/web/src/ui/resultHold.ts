import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { Period } from '@rca/core/period'
import type { LibraryKnowledge } from './analysis/libraryKnowledge'
import { effortHold, heldAction, heldReason } from './components/headlineNeed'
import { headlineShortfall } from './components/pickHeadline'
import { headlinePick } from './components/pickHeadline'
import type { HeadlinePick } from './components/pickHeadline'

/*
 * The one place that says whether results are held back, and why. Balance, the Method page, what moved, the share
 * card, the share button and the page that stands in the main area all read it, so no surface states a comparison
 * another holds back. Reasons are tried in one order, most important first; the first that applies is the hold.
 * - `updating` (scope `results`): the library is there and its digests are held out for another model. It needs no
 *   result, and while it is on the results are replaced by the library page.
 * - `partial-import` (scope `headline`): an import is known partial (`useLibraryPage` feeds it from the import record).
 * - `implausible-ride` and `effort` (scope `headline`): the evidence behind the headline comparison.
 */

/** Why the results are held, most important first. */
export type HoldReason = 'updating' | 'partial-import' | 'implausible-ride' | 'effort'

/** How much is held: every result page, or only the headline comparisons and what is made from them. */
export type HoldScope = 'results' | 'headline'

export interface Hold {
  reason: HoldReason
  scope: HoldScope
  /** The sports it is about; empty for the whole library. */
  sports: Sport[]
  /** What is wrong, as a sentence. */
  text: string
  /** What lifts it, as a sentence. */
  action: string
}

/** What the library says to the `updating` reason: how much is known, and how many digests are held out. */
export interface UpdatingInputs {
  knowledge: LibraryKnowledge
  /** Digests held out for an older model. */
  stale: number
  /** Digests held out for a newer app. */
  newer: number
}

/**
 * What else can hold results, from outside the result. D6a feeds `implausibleRide` (a ride that works out to more
 * than a runner can do); until it does, nothing is passed and it holds nothing. `partialImport` is fed by `useLibraryPage`.
 */
export interface HoldInputs {
  updating?: UpdatingInputs | null
  partialImport?: { text: string; action: string } | null
  implausibleRide?: { text: string; action: string } | null
}

/**
 * Whether one stale digest holds every result back, as the design has it for an exclusive revision. Off, the
 * results of the digests that are read still show beside the notice, as they do today, and `updating` applies
 * only when nothing is readable. One line to turn it on, when revision 7 makes a mixed library a real state.
 */
export const HOLD_ON_ANY_STALE = false

type Reason = (result: AnalysisResult | null, inputs: HoldInputs) => Hold | null

const updating: Reason = (result, { updating: library }) => {
  if (library === undefined || library === null || library.knowledge !== 'present') return null
  const waiting = library.stale + library.newer > 0
  if (!waiting || (result !== null && !(HOLD_ON_ANY_STALE && library.stale > 0))) return null
  const stale = library.stale > 0
  return {
    reason: 'updating',
    scope: 'results',
    sports: [],
    text: stale
      ? 'Your library is being updated, so your results are held.'
      : 'Your library was made by a newer version of this app.',
    action: stale
      ? 'Update your library to see your results.'
      : 'Reload the page to update the app.',
  }
}

const partialImport: Reason = (_, { partialImport: held }) =>
  held === undefined || held === null
    ? null
    : { reason: 'partial-import', scope: 'headline', sports: [], ...held }

const implausibleRide: Reason = (_, { implausibleRide: ride }) =>
  ride === undefined || ride === null
    ? null
    : { reason: 'implausible-ride', scope: 'headline', sports: ['ride'], ...ride }

const effort: Reason = (result) => {
  if (result === null) return null
  const held = effortHold(result)
  return held === null ? null : { reason: 'effort', scope: 'headline', ...held }
}

/** Every reason, in the order they take precedence. */
const REASONS: readonly Reason[] = [updating, partialImport, implausibleRide, effort]

/** The hold on the results, or null when there is none. `updating` needs no result; the others read it. */
export function holdOf(result: AnalysisResult | null, inputs: HoldInputs = {}): Hold | null {
  for (const reason of REASONS) {
    const hold = reason(result, inputs)
    if (hold !== null) return hold
  }
  return null
}

/** The headline's pick under the hold: none while the comparison is held, else the pick of the result. */
export function heldPick(
  result: AnalysisResult,
  inputs: HoldInputs = {},
): { hold: Hold | null; pick: HeadlinePick | null } {
  const hold = holdOf(result, inputs)
  return { hold, pick: hold === null ? headlinePick(result) : null }
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

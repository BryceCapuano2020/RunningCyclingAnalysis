import { useCallback, useEffect, useRef } from 'react'
import type { SessionState } from '@rca/core/session'
import type { CheckInView, ImportOutcome } from '../../worker/protocol'
import type { AccountResults } from './accountResults'
import { baselineOf, comparableBefore } from './importState'
import type { ImportChange } from './importState'
import type { Baseline } from './model'
import { isUpdate } from './replyHandlers'

/** What an import added or brought up to date: none of it moves a figure. */
const movedNothing = (outcome: ImportOutcome) =>
  (outcome.runs ?? 0) +
    (outcome.rides ?? 0) +
    (outcome.updatedRuns ?? 0) +
    (outcome.updatedRides ?? 0) ===
  0

/**
 * What an account's import moved ("what changed" beside its summary): the results before it (the baseline taken as it was sent) and
 * the first results that include it, which are the server's. An import ends before they have come, so it waits for a snapshot of a
 * later library version; one that added nothing says so at once. Dismissing the summary, or the next import, ends the wait.
 */
export function useAccountImportChange(
  results: AccountResults | null,
  setImportChange: (change: ImportChange | null) => void,
): (outcome: ImportOutcome, baseline: Baseline | null | undefined) => void {
  const waiting = useRef<{ outcome: ImportOutcome; baseline: Baseline | null | undefined } | null>(
    null,
  )
  const latest = useRef(results)
  const land = useCallback(() => {
    const now = latest.current
    const held = waiting.current
    if (held === null || now === null) return
    const { outcome, baseline } = held
    if (!movedNothing(outcome) && now.snapshot.libraryVersion <= (baseline?.version ?? -1)) return
    waiting.current = null
    setImportChange({
      outcome,
      before: isUpdate(outcome) ? null : comparableBefore(baseline, now.state),
      after: now.state.result,
      bests: null,
    })
  }, [setImportChange])
  useEffect(() => {
    latest.current = results
    land()
  }, [results, land])
  return useCallback(
    (outcome, baseline) => {
      waiting.current = { outcome, baseline }
      land()
    },
    [land],
  )
}

/** The account's results as an import's baseline: what is shown, with the library version it was taken from. */
export function accountBaseline(
  state: SessionState,
  results: AccountResults | null,
): Baseline | null {
  const baseline = baselineOf(state)
  return baseline === null || results === null
    ? baseline
    : { ...baseline, version: results.snapshot.libraryVersion }
}

/**
 * The change on screen: it belongs to the outcome on screen (a cleared or replaced summary drops it). An account's summary lists the bests
 * the check-in lists, which come from the worker as the check-in answers, so they are filled in then.
 */
export function shownChange(
  change: ImportChange | null,
  outcome: ImportOutcome | null,
  account: boolean,
  checkIn: CheckInView,
): ImportChange | null {
  if (change === null || change.outcome !== outcome) return null
  return account ? { ...change, bests: change.bests ?? checkIn.checkIn?.bests ?? null } : change
}

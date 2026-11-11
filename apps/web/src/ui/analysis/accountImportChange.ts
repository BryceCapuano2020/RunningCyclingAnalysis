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

interface Waiting {
  outcome: ImportOutcome
  baseline: Baseline | null | undefined
  /** The library version after the import's last save, which the results must reach; unknown when it could not be read. */
  version: number | undefined
  /** The account the import was made in. */
  userId: string | null
}

interface ImportChangeDeps {
  results: AccountResults | null
  /** The account whose results these are: another one ends a wait. */
  userId: string | null
  /** The row on screen, and the library version of the snapshot it was answered for. */
  checkIn: CheckInView
  checkInVersion: () => number | null
  setImportChange: (change: ImportChange | null) => void
}

/**
 * What an account's import moved ("what changed" beside its summary): the results before it (the baseline taken as it was sent) and
 * the first results that include it, which are the server's. An import ends before they have come, so it waits for results that are
 * current (the server's latest, not the stored snapshot it served while it computed) and of a library version at or past the one the
 * import ended at (a compute made in the middle of an import has some of its files). The bests are the check-in's, taken when the row
 * for those results has come, so figures and bests are of one baseline. One that added nothing says so at once. Dismissing the summary,
 * the next import and another account end the wait.
 */
export function useAccountImportChange({
  results,
  userId,
  checkIn,
  checkInVersion,
  setImportChange,
}: ImportChangeDeps): {
  landed: (
    outcome: ImportOutcome,
    baseline: Baseline | null | undefined,
    version: number | undefined,
  ) => void
  clear: () => void
} {
  const waiting = useRef<Waiting | null>(null)
  const latest = useRef({ results, checkIn, userId })
  const answeredFor = useRef(checkInVersion)
  const land = useCallback(() => {
    const { results: now, checkIn: row, userId: current } = latest.current
    const held = waiting.current
    if (held === null) return
    // Another account's results never satisfy it.
    if (held.userId !== current) {
      waiting.current = null
      return
    }
    if (now === null) return
    const { outcome, baseline, version } = held
    if (!movedNothing(outcome)) {
      if (!now.current) return
      const reached = version === undefined ? (baseline?.version ?? -1) + 1 : version
      if (now.snapshot.libraryVersion < reached) return
      // The row goes with these results: it was answered for them, or they carry none.
      const row_ = answeredFor.current()
      if (
        now.snapshot.checkIn !== undefined &&
        (row_ === null || row_ < now.snapshot.libraryVersion)
      )
        return
    }
    waiting.current = null
    setImportChange({
      outcome,
      before: isUpdate(outcome) ? null : comparableBefore(baseline, now.state),
      after: now.state.result,
      bests: row.checkIn?.bests ?? null,
    })
  }, [setImportChange])
  useEffect(() => {
    latest.current = { results, checkIn, userId }
    answeredFor.current = checkInVersion
    land()
  }, [results, checkIn, userId, checkInVersion, land])
  return {
    landed: useCallback(
      (outcome, baseline, version) => {
        waiting.current = { outcome, baseline, version, userId: latest.current.userId }
        land()
      },
      [land],
    ),
    clear: useCallback(() => {
      waiting.current = null
    }, []),
  }
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

/** The change on screen: it belongs to the outcome on screen (a cleared or replaced summary drops it). */
export function shownChange(
  change: ImportChange | null,
  outcome: ImportOutcome | null,
): ImportChange | null {
  return change !== null && change.outcome === outcome ? change : null
}

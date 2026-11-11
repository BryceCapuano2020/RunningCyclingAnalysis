import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ImportFacts, IndexFacts, SessionState } from '@rca/core/session'
import type { LiftResults } from '@rca/core/lift'
import { fromSnapshot, liftOfSnapshot, snapshotIsCurrent } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { ApiRequestError } from '../../api/apiError'
import { readServerState } from '../../api/state'
import type { StateRead } from '../../api/state'
import { readSnapshot, writeSnapshot } from '../../worker/stateStore'
import { useOwnChanges, useTabMessages } from '../tabSync'
import { copyIsStale } from './copyAge'
import type { ImportState } from './importState'
import { EMPTY_SESSION } from './model'
import { reloadOnceForNewBuild } from './staleBuild'

/** How often a tab in view asks the server whether the results changed. */
export const POLL_MS = 60_000
/**
 * How long a tab waits to ask again when the server served what it had stored while it computed (`X-State-Current: 0`), or
 * answered 202. It doubles with each answer in a row that is no better, up to the poll, so a row that stays stale (the budget
 * spent, the queue slow) is asked for about once a minute, not every few seconds.
 */
export const BUSY_RETRY_MS = 3_000

/** The wait before the next ask after `misses` answers in a row that were not current. */
export function busyWaitMs(misses: number): number {
  return Math.min(BUSY_RETRY_MS * 2 ** Math.max(0, misses - 1), POLL_MS)
}

/** The results of an account as the server computed them, and the snapshot they came from. */
export interface AccountResults {
  state: SessionState
  snapshot: StateSnapshot
  /** Made on an earlier local day than now (or in another zone): shown, and replaced as soon as the server answers. */
  stale: boolean
  /** The server said this is the latest (not the stored snapshot it served while it computed), and has answered since this tab opened. */
  current: boolean
}

function resultsOf(snapshot: StateSnapshot, current: boolean): AccountResults | null {
  try {
    return {
      state: fromSnapshot(snapshot),
      snapshot,
      stale: copyIsStale(snapshot, Date.now()),
      current,
    }
  } catch {
    // A snapshot that does not decode is not shown.
    return null
  }
}

/**
 * An account's results: the copy kept on this device (`rca-state`) painted at once, then `GET /api/state` with the copy's ETag, which
 * replaces it when the server answers with a different snapshot. The browser computes nothing and writes no snapshot of its own for an
 * account.
 *
 * - 304: the copy stands; the server's `X-State-Now` and `X-State-Computed-Version` are written into the stored copy's `nowMs` and
 *   `libraryVersion`, so an unchanged recompute does not leave
 *   it marked old after a reload.
 * - 202 (computing): the copy stays, or nothing is shown yet; it asks again after `Retry-After`.
 * - `X-State-Current: 0` (the stored snapshot, served while the server computes): shown, and it asks again in a few seconds.
 * - A snapshot of another build (the Worker serves its own, so this tab is old): the copy stays and the tab reloads once.
 * - Asked again on a message from another tab or a change this tab made, on coming back into view, and every minute while in view.
 *
 * `userId` is the signed-in account's id. With `keepOnExpiry` (the session ended without a sign-out) the results stay on screen and
 * nothing more is asked. A reply that comes after the account changed is dropped.
 */
export function useAccountResults(
  userId: string | null,
  keepOnExpiry: boolean,
  /** This tab has no work of its own under way, so a reload for a newer build would cut across nothing. */
  quiet: boolean,
  /** The server's library is past the one the worker's index was listed at: another device changed it. */
  onIndexBehind: () => void,
): {
  results: AccountResults | null
  refresh: () => void
  /** The page's Retry, asking now with the waits going on; null when the last failure was a spent budget (a 429), which asking cannot mend. */
  retry: (() => void) | null
  indexListed: (version?: number) => void
  /** The library version the worker's index was listed at, when it said (null otherwise): results of an earlier version are behind it. */
  listedVersion: number | null
  /** The last ask could not be answered (an error, a timeout, a 429, or a 404): nothing is known to be wrong with the library. */
  failed: boolean
} {
  // The results with the account they are of, so a shown result is never another account's.
  const [stored, setStored] = useState<{ id: string; results: AccountResults } | null>(null)
  const results =
    stored !== null && (stored.id === userId || (userId === null && keepOnExpiry))
      ? stored.results
      : null
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [listedVersion, setListedVersion] = useState<number | null>(null)
  const failed = failedFor !== null && failedFor === userId
  // The failure was a 429: the account's budget for the day is spent, and asking again does not change that.
  const [spent, setSpent] = useState(false)
  const idRef = useRef<string | null>(null)
  const epoch = useRef(0)
  const held = useRef<StateSnapshot | null>(null)
  const running = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Answers in a row that were not current (see `busyWaitMs`).
  const misses = useRef(0)
  // The snapshot of another build the server sent, whose tag the next ask carries so a refused reload costs a 304, not a body.
  const refused = useRef<StateSnapshot | null>(null)
  const reloadWanted = useRef(false)
  const quietNow = useRef(quiet)
  // The library version the worker's index was listed at; null means the next snapshot's version is it.
  const indexAt = useRef<number | null>(null)
  const behind = useRef(onIndexBehind)
  useEffect(() => {
    behind.current = onIndexBehind
  }, [onIndexBehind])

  const keep = useCallback((snapshot: StateSnapshot, shown: AccountResults | null) => {
    held.current = snapshot
    if (shown !== null && idRef.current !== null) setStored({ id: idRef.current, results: shown })
    if (idRef.current !== null) void writeSnapshot(idRef.current, snapshot)
  }, [])

  /** Reloads for a newer build once this tab has nothing of its own under way: hidden or not, since a hidden tab can be mid-import. */
  const settleReload = useCallback(() => {
    if (!reloadWanted.current || !quietNow.current) return
    reloadWanted.current = false
    reloadOnceForNewBuild()
  }, [])

  /** The index was listed at `indexAt`; a library version past it is another device's change. */
  const checkIndex = useCallback((version: number) => {
    const listed = indexAt.current
    if (listed === null) indexAt.current = version
    else if (version > listed) {
      indexAt.current = null
      behind.current()
    }
  }, [])

  const apply = useCallback(
    (read: Exclude<StateRead, { kind: 'none' }>): number | null => {
      if (read.kind === 'computing') {
        misses.current++
        return Math.max(read.retryAfterMs, busyWaitMs(misses.current))
      }
      if (read.kind === 'unchanged') {
        // A 304 on the tag of a refused snapshot says nothing of the copy.
        const copy = refused.current === null ? held.current : null
        const nowMs = read.nowMs ?? copy?.nowMs
        const libraryVersion = read.version ?? copy?.libraryVersion
        if (copy !== null && (nowMs !== copy.nowMs || libraryVersion !== copy.libraryVersion)) {
          // Written into the held copy beside `nowMs`: a version bump that moved no figure is still a version the results cover.
          const moved = { ...copy, nowMs: nowMs!, libraryVersion: libraryVersion! }
          keep(moved, resultsOf(moved, read.current))
          checkIndex(moved.libraryVersion)
        } else if (copy !== null) {
          const stale = copyIsStale(copy, Date.now())
          const { current } = read
          setStored((was) =>
            was?.id === idRef.current
              ? { ...was, results: { ...was.results, stale, current } }
              : was,
          )
        }
      } else if (!snapshotIsCurrent(read.snapshot)) {
        refused.current = read.snapshot
        reloadWanted.current = true
        settleReload()
      } else {
        refused.current = null
        const snapshot =
          read.nowMs === null ? read.snapshot : { ...read.snapshot, nowMs: read.nowMs }
        keep(snapshot, resultsOf(snapshot, read.current))
        checkIndex(snapshot.libraryVersion)
      }
      misses.current = read.current ? 0 : misses.current + 1
      return read.current ? null : busyWaitMs(misses.current)
    },
    [keep, settleReload, checkIndex],
  )

  const pull = useCallback(
    async function run(fresh = false): Promise<void> {
      // Only while in view: coming back into view asks again at once. One timer at most, whichever ask armed the last.
      const armRetry = (wait: number) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          if (document.visibilityState === 'visible') void run()
        }, wait)
      }
      if (idRef.current === null) return
      // A change someone made (this tab, or another) starts the waits again: a burst of them is not a row that stays stale.
      if (fresh) misses.current = 0
      if (running.current) {
        again.current = true
        return
      }
      running.current = true
      const mine = epoch.current
      try {
        clearTimeout(timer.current)
        const id = idRef.current
        const tag = refused.current ?? held.current
        let over = false
        const read = await Promise.resolve()
          .then(() => readServerState(id, tag))
          .catch((error: unknown) => {
            over = error instanceof ApiRequestError && error.status === 429
            return null
          })
        if (mine !== epoch.current) return
        // An error, a timeout, a 429 or a 404 leaves what is held and asks again, the waits doubling as they do for a row that stays stale.
        if (!read || read.kind === 'none') {
          setFailedFor(id)
          setSpent(over)
          misses.current++
          armRetry(busyWaitMs(misses.current))
          return
        }
        setFailedFor(null)
        setSpent(false)
        const wait = apply(read)
        if (wait !== null) armRetry(wait)
      } finally {
        // A read of an account since left must not end the one the new account has begun.
        if (mine === epoch.current) {
          running.current = false
          if (again.current) {
            again.current = false
            void run()
          }
        }
      }
    },
    [apply],
  )

  // The account on screen: its copy first, then the server. Another account, or none, drops what was shown (an expired session keeps it).
  useEffect(() => {
    if (userId === null && keepOnExpiry) {
      idRef.current = null
      epoch.current++
      clearTimeout(timer.current)
      return
    }
    idRef.current = userId
    const mine = ++epoch.current
    running.current = false
    again.current = false
    held.current = null
    refused.current = null
    reloadWanted.current = false
    misses.current = 0
    indexAt.current = null
    if (userId === null) return
    void readSnapshot(userId).then((copy) => {
      if (mine !== epoch.current) return
      // An answer that came first (a change, or a poll, before the copy was read) is newer than the copy.
      if (copy !== null && held.current === null && snapshotIsCurrent(copy)) {
        held.current = copy
        const shown = resultsOf(copy, false)
        if (shown !== null) setStored({ id: userId, results: shown })
      }
      void pull()
    })
    return () => clearTimeout(timer.current)
  }, [userId, keepOnExpiry, pull])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull()
    }
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(onVisible, POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    }
  }, [pull])

  // A reload held back for work under way goes once the tab has none.
  useEffect(() => {
    quietNow.current = quiet
    if (quiet) settleReload()
  }, [quiet, settleReload])

  // What another tab, or this one, changed in the account: its results are asked for again.
  const onChange = useCallback(() => void pull(true), [pull])
  useTabMessages(onChange)
  useOwnChanges(onChange)

  // The index has just been read at `version` (the library's, before the list was read), or kept current by this tab's own work (no
  // version: the next snapshot's is the one it matches).
  const indexListed = useCallback((version?: number) => {
    indexAt.current = version ?? null
    setListedVersion(version ?? null)
  }, [])
  // The page's Retry: asks now, and the waits go on from where they were (a change, which starts them again, is `refresh`).
  const retry = useCallback(() => void pull(), [pull])
  return {
    results,
    refresh: onChange,
    retry: spent ? null : retry,
    indexListed,
    listedVersion,
    failed,
  }
}

/**
 * The server's state with what only the browser knows laid over it: the last import's facts (refused files, unsaved activities) and the
 * worker's index (the library's age and size). For the same digests and no import they are what the state already holds, so the layer
 * changes nothing (held by the equivalence test).
 */
export function layerState(
  state: SessionState,
  facts: ImportFacts | null,
  index: IndexFacts | null,
): SessionState {
  return { ...state, ...facts, ...index }
}

/** What the page shows. */
interface Shown {
  state: SessionState
  /** The account's lift results (L3); null signed out, and before the server has answered. */
  lift: LiftResults | null
  /** The account's results are a copy made on an earlier day. */
  stale: boolean
}

/**
 * What the page shows: for an account, the server's state with what only the browser knows laid over it. The refused files and unsaved
 * activities of the last import come from its `facts`; the library's age and size from the worker's index, which is current the moment a
 * delete or an update ends, where a snapshot may be a moment behind. An expired session keeps the account's results until a state of the
 * device's own arrives (a file dropped after the expiry is analysed here), which is then the one shown.
 */
export function useShownResults(
  results: AccountResults | null,
  signedIn: boolean,
  expired: boolean,
  device: Pick<ImportState, 'state' | 'facts' | 'index'>,
): Shown {
  const keeps = useKeepsAccount(!signedIn && expired, device.state)
  const shows = signedIn || (keeps && results !== null)
  const held = shows ? results : null
  const lift = useMemo(() => (held === null ? null : liftOfSnapshot(held.snapshot)), [held])
  const state = useMemo(
    () => layerState(held?.state ?? EMPTY_SESSION, device.facts, device.index),
    [held, device.facts, device.index],
  )
  return { state: shows ? state : device.state, lift, stale: held?.stale === true }
}

/**
 * Whether an expired session still shows the account's results: until a state of the device's own arrives, which is then the one shown.
 */
function useKeepsAccount(expired: boolean, deviceState: SessionState): boolean {
  const [atExpiry, setAtExpiry] = useState<SessionState | null>(null)
  if (expired && atExpiry === null) setAtExpiry(deviceState)
  else if (!expired && atExpiry !== null) setAtExpiry(null)
  return expired && deviceState === atExpiry
}

/**
 * Whether the page waits for an account's results, or could not get them. A signed-in account with none yet shows its loading state, not
 * an empty library. So does one whose results are older than its library: a snapshot the server served from its store while it computes
 * (not current, or a copy kept from an earlier visit), with nothing in it while the index lists activities, or of a library version
 * behind the one the index was listed at. One the server could not answer says so, with a retry, unless the library read itself failed
 * (its notice has it). `listed` is how many activities the index lists.
 */
export function resultsFlags(
  userId: string | null,
  {
    results,
    failed,
    listedVersion,
  }: { results: AccountResults | null; failed: boolean; listedVersion: number | null },
  libraryStatus: string,
  listed: number,
): { resultsWaiting: boolean; resultsFailed: boolean } {
  if (userId === null) return { resultsWaiting: false, resultsFailed: false }
  const behind =
    results === null ||
    (!results.current &&
      ((results.state.result === null && listed > 0) ||
        (listedVersion !== null && results.snapshot.libraryVersion < listedVersion)))
  return {
    resultsWaiting: behind && !failed,
    resultsFailed: behind && failed && libraryStatus !== 'failed',
  }
}

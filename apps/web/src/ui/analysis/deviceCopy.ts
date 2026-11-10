import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '@rca/core/session'
import { fromSnapshot, toSnapshot } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import {
  DEVICE_STATE_SCOPE,
  clearSnapshot,
  readSnapshot,
  writeSnapshot,
} from '../../worker/stateStore'
import { browserZone, copyIsStale } from './copyAge'
import type { Account, LibraryStatus } from './model'
import { accountPending } from './model'
import { newerServerCopy } from './serverCopy'

/** How long the state must stand still before it is kept, so an import's replies cost one write. */
const KEEP_AFTER_MS = 1_500

type CopyAccount = Pick<Account, 'status' | 'lookupPending' | 'me'>

/** The device copy on screen: the results of the last visit, until the live analysis replaces them. */
export interface PaintedCopy {
  scope: string
  state: SessionState
  /** The instant the analysis behind it treated as now. */
  madeAt: number
  /** Made on an earlier local day (or in another zone): shown at once, replaced as soon as the live analysis is ready. */
  stale: boolean
}

/** The scope the page shows now: an account's id, the device, or null while it is not known who is signed in. */
export function scopeOf(account: CopyAccount): string | null {
  if (account.status === 'signed-in' && account.me !== null) return account.me.user.id
  return accountPending(account) ? null : DEVICE_STATE_SCOPE
}

async function loadCopy(
  scope: string,
): Promise<{ copy: PaintedCopy; snapshot: StateSnapshot } | null> {
  const snapshot = await readSnapshot(scope)
  if (snapshot === null) return null
  try {
    const state = fromSnapshot(snapshot)
    const copy = { scope, state, madeAt: snapshot.nowMs, stale: copyIsStale(snapshot, Date.now()) }
    return { copy, snapshot }
  } catch {
    // A copy that does not decode is never read, so it goes.
    await clearSnapshot(scope)
    return null
  }
}

/**
 * The device copy of the results (`rca-state`): painted at once on open, kept after each live analysis. For an account the
 * server's snapshot replaces it when the server has a newer one (`./serverCopy`); where the server has none the copy stands.
 * The device's copy
 * is read as the page mounts, an account's as soon as it is known to be signed in; a copy of another scope is dropped, and
 * so is the copy once the live analysis answers (or the library cannot be read). Returns the copy to show, or null.
 */
export function useDeviceCopy(
  account: CopyAccount,
  live: SessionState,
  libraryStatus: LibraryStatus,
  busy: boolean,
): PaintedCopy | null {
  const [copy, setCopy] = useState<PaintedCopy | null>(null)
  const [first] = useState(live)
  // The scope whose live analysis has answered: its copy is not read again, even if its library is read anew.
  const answered = useRef<string | null>(null)
  const scope = scopeOf(account)
  const signedIn = account.status === 'signed-in'
  // Whether /api/me says the server computes this account's results: no request is made for any other account.
  const serverState = account.me?.serverState === true
  // A state the worker has sent is live: the page never shows a copy over it. For an account it is the state of its
  // library read, not one made before the account was known.
  const liveArrived = live !== first && (!signedIn || libraryStatus === 'loaded')
  const gone =
    liveArrived ||
    libraryStatus === 'failed' ||
    (copy !== null && scope !== null && copy.scope !== scope)

  // The device's copy on mount; an account's once it is known.
  useEffect(() => {
    const wanted = scope ?? DEVICE_STATE_SCOPE
    if (liveArrived) answered.current = wanted
    if (liveArrived || answered.current === wanted) return
    let current = true
    void loadCopy(wanted).then(async (found) => {
      if (!current) return
      setCopy(found?.copy ?? null)
      // An account's server snapshot, when it has one and it is newer: shown and kept as the device copy.
      if (scope === null || scope === DEVICE_STATE_SCOPE) return
      const server = await newerServerCopy(scope, found?.snapshot ?? null, serverState)
      if (server === null || !current) return
      setCopy({
        scope,
        state: server.state,
        madeAt: server.snapshot.nowMs,
        stale: copyIsStale(server.snapshot, Date.now()),
      })
      void writeSnapshot(scope, server.snapshot)
    })
    return () => {
      current = false
    }
  }, [scope, liveArrived, serverState])

  // A copy that is no longer shown is dropped, so it does not come back when a later reload of the library clears `gone`.
  if (gone && copy !== null) setCopy(null)

  // Keeps the live results as this scope's copy once they stand still; a library with no results leaves none.
  useEffect(() => {
    if (!liveArrived || scope === null || busy || live.isSample) return
    const timer = setTimeout(() => {
      if (live.result === null) {
        void clearSnapshot(scope)
        return
      }
      try {
        void writeSnapshot(
          scope,
          toSnapshot(live, {
            libraryVersion: 0,
            nowMs: Date.now(),
            zone: browserZone(),
            buildSha: 'device',
          }),
        )
      } catch {
        // A state that cannot be kept leaves the last copy as it was.
      }
    }, KEEP_AFTER_MS)
    return () => clearTimeout(timer)
  }, [live, liveArrived, scope, busy])

  return gone ? null : copy
}

import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '@rca/core/session'
import { fromSnapshot, toSnapshot } from '@rca/core/stateSnapshot'
import {
  DEVICE_STATE_SCOPE,
  clearSnapshot,
  readSnapshot,
  writeSnapshot,
} from '../../worker/stateStore'
import { browserZone, copyIsStale } from './copyAge'
import type { Account, LibraryStatus } from './model'
import { accountPending } from './model'

/** How long the state must stand still before it is kept, so an import's replies cost one write. */
const KEEP_AFTER_MS = 1_500

type CopyAccount = Pick<Account, 'status' | 'lookupPending' | 'me'>

/** The device copy on screen: the results of the last visit, until the live analysis replaces them. */
export interface PaintedCopy {
  state: SessionState
  /** The instant the analysis behind it treated as now. */
  madeAt: number
  /** Made on an earlier local day (or in another zone): shown at once, replaced as soon as the live analysis is ready. */
  stale: boolean
}

async function loadCopy(): Promise<PaintedCopy | null> {
  const snapshot = await readSnapshot(DEVICE_STATE_SCOPE)
  if (snapshot === null) return null
  try {
    return {
      state: fromSnapshot(snapshot),
      madeAt: snapshot.nowMs,
      stale: copyIsStale(snapshot, Date.now()),
    }
  } catch {
    // A copy that does not decode is never read, so it goes.
    await clearSnapshot(DEVICE_STATE_SCOPE)
    return null
  }
}

/**
 * The signed-out visitor's copy of the results (`rca-state`, scope `device`): painted at once on open, kept after each live
 * analysis. A signed-in account has none here: its results are the server's, and their copy is kept by `useAccountResults`,
 * so the browser never writes a snapshot it computed itself for an account. The copy is read as the page mounts, and dropped
 * once the live analysis answers (or the library cannot be read). Returns the copy to show, or null.
 */
export function useDeviceCopy(
  account: CopyAccount,
  live: SessionState,
  libraryStatus: LibraryStatus,
  busy: boolean,
): PaintedCopy | null {
  const [copy, setCopy] = useState<PaintedCopy | null>(null)
  const [first] = useState(live)
  const answered = useRef(false)
  const signedIn = account.status === 'signed-in'
  const pending = accountPending(account)
  // A state the worker has sent is live: the page never shows a copy over it.
  const liveArrived = live !== first
  const gone = liveArrived || libraryStatus === 'failed' || signedIn

  useEffect(() => {
    if (liveArrived) answered.current = true
    if (liveArrived || answered.current || signedIn) return
    let current = true
    void loadCopy().then((found) => {
      if (current) setCopy(found)
    })
    return () => {
      current = false
    }
  }, [liveArrived, signedIn])

  // A copy that is no longer shown is dropped, so it does not come back when a later reload of the library clears `gone`.
  if (gone && copy !== null) setCopy(null)

  // Keeps the live results as the device's copy once they stand still; a library with no results leaves none.
  useEffect(() => {
    if (!liveArrived || signedIn || pending || busy || live.isSample) return
    const timer = setTimeout(() => {
      if (live.result === null) {
        void clearSnapshot(DEVICE_STATE_SCOPE)
        return
      }
      try {
        void writeSnapshot(
          DEVICE_STATE_SCOPE,
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
  }, [live, liveArrived, signedIn, pending, busy])

  return gone ? null : copy
}

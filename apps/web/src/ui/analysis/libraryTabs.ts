import { useCallback, useEffect, useRef } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import { storedPeriodRequest } from '../periodPreference'
import { tellOtherTabs, useTabMessages } from '../tabSync'
import type { TabMessage } from '../tabSync'
import { useLatest } from './useLatest'
import type { Account, Box, LibraryStatus } from './model'
import type { WorkerTransport } from './workerTransport'

/** How long a change is left to settle before the library is read again, so a burst of them reads once. */
export const RELOAD_DEBOUNCE_MS = 1_000
/** How many times a reload waits for this tab's own work to end before it gives up until the next change. */
const BUSY_RETRIES = 5

type Scope = 'device' | 'account'

interface LibraryTabsDeps {
  accountRef: Box<Account>
  settingsRef: Box<AthleteSettings>
  send: WorkerTransport['send']
  libraryStatus: LibraryStatus
  loadLibrary: (userId: string) => void
  /** Whether this tab is in the middle of work of its own (an import, a delete), which a reload would cut across. */
  busy: boolean
}

/**
 * Keeps this tab's library in step with changes made elsewhere.
 *
 * - Another tab changed the library kept in this browser, or the account's library: this tab reads it
 *   again, a moment after the last such message, and only while it is in view and not busy with its own
 *   work. A tab that is out of view reads once it comes back.
 * - The account's results are not read here: `useAccountResults` asks the server for them on the same messages, on coming
 *   back into view and every minute. This reads the account's list of activities (the worker's index), on a message only.
 * - The tab's own changes are announced to the others.
 */
export function useLibraryTabs(deps: LibraryTabsDeps): {
  libraryChanged: (scope: Scope) => void
  /** The server's results show the account's library past the index this tab listed: another device changed it. */
  indexBehind: () => void
} {
  const latest = useLatest(deps)
  const dirty = useRef<Scope | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retries = useRef(0)
  // The reload asks itself again while the tab is busy.
  const again = useRef<(() => void) | null>(null)

  const reload = useCallback(async () => {
    const { accountRef, settingsRef, send, libraryStatus, loadLibrary, busy } = latest()
    const scope = dirty.current
    if (scope === null || document.visibilityState !== 'visible') return
    if (busy) {
      if (retries.current++ < BUSY_RETRIES)
        timer.current = setTimeout(() => again.current?.(), RELOAD_DEBOUNCE_MS)
      return
    }
    dirty.current = null
    retries.current = 0
    const { status, me } = accountRef.current
    if (scope === 'device') {
      if (status !== 'signed-in') {
        send({
          type: 'loadDevice',
          settings: settingsRef.current,
          reload: true,
          ...storedPeriodRequest(),
        })
      }
      return
    }
    if (status !== 'signed-in' || me === null || libraryStatus !== 'loaded') return
    loadLibrary(me.user.id)
  }, [latest])

  useEffect(() => {
    again.current = () => void reload()
  }, [reload])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => again.current?.(), RELOAD_DEBOUNCE_MS)
  }, [])

  const onMessage = useCallback(
    (message: TabMessage) => {
      if (message.type !== 'library') return
      // The device's library is the signed-out visitor's, the account's the signed-in one's.
      const signedIn = latest().accountRef.current.status === 'signed-in'
      if ((message.scope === 'account') !== signedIn) return
      dirty.current = message.scope
      schedule()
    },
    [latest, schedule],
  )
  useTabMessages(onMessage)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && dirty.current !== null) schedule()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(timer.current)
    }
  }, [schedule])

  const libraryChanged = useCallback(
    (scope: Scope) => tellOtherTabs({ type: 'library', scope }),
    [],
  )
  const indexBehind = useCallback(() => {
    dirty.current = 'account'
    schedule()
  }, [schedule])
  return { libraryChanged, indexBehind }
}

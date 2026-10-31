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
/** How often a tab coming back into view looks for a change made on another device. */
const REVISION_CHECK_MS = 30_000
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
 * - The account's library is also checked on coming back into view, at most every 30 s, against the
 *   revision tag `/api/me` carries. The tag is only a hint that something changed: a different tag makes
 *   the tab read the library, an equal one never proves it is current. A message from another tab needs no
 *   hint: it is read.
 * - The tab's own changes are announced to the others, and the revision after them is taken as the
 *   baseline, so they are not mistaken for changes made elsewhere.
 */
export function useLibraryTabs(deps: LibraryTabsDeps): {
  libraryChanged: (scope: Scope) => void
} {
  const latest = useLatest(deps)
  const dirty = useRef<Scope | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retries = useRef(0)
  const baseline = useRef<string | undefined>(undefined)
  const checkedAt = useRef(0)
  // Whether another tab said the library changed (so it is read), or only the revision hint suggests it.
  const heard = useRef(false)
  // The reload asks itself again while the tab is busy.
  const again = useRef<() => void>(() => undefined)

  // The library has just been read: the account's revision as it stands is the one it matches.
  useEffect(() => {
    if (deps.libraryStatus === 'loaded')
      baseline.current = deps.accountRef.current.me?.libraryRevision
  }, [deps.libraryStatus, deps.accountRef])

  const reload = useCallback(async () => {
    const { accountRef, settingsRef, send, libraryStatus, loadLibrary, busy } = latest()
    const scope = dirty.current
    if (scope === null || document.visibilityState !== 'visible') return
    if (busy) {
      if (retries.current++ < BUSY_RETRIES)
        timer.current = setTimeout(() => again.current(), RELOAD_DEBOUNCE_MS)
      return
    }
    dirty.current = null
    retries.current = 0
    const certain = heard.current
    heard.current = false
    const { status, me, refresh } = accountRef.current
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
    if (
      status !== 'signed-in' ||
      me === null ||
      libraryStatus !== 'loaded' ||
      refresh === undefined
    )
      return
    // A tab that said it changed the library is believed: its change may leave the revision tag as it was (a
    // delete and an add of the same size), and the baseline may already include the rows. Only the hint on coming
    // back into view, with no message behind it, is judged by the tag.
    const found = await refresh().catch(() => null)
    if (found === null) {
      if (certain) loadLibrary(me.user.id)
      return
    }
    if (!certain && found.libraryRevision === baseline.current) return
    baseline.current = found.libraryRevision
    loadLibrary(found.user.id)
  }, [latest])

  useEffect(() => {
    again.current = () => void reload()
  }, [reload])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => again.current(), RELOAD_DEBOUNCE_MS)
  }, [])

  const onMessage = useCallback(
    (message: TabMessage) => {
      if (message.type !== 'library') return
      // The device's library is the signed-out visitor's, the account's the signed-in one's.
      const signedIn = latest().accountRef.current.status === 'signed-in'
      if ((message.scope === 'account') !== signedIn) return
      dirty.current = message.scope
      heard.current = true
      schedule()
    },
    [latest, schedule],
  )
  useTabMessages(onMessage)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (
        dirty.current === null &&
        latest().accountRef.current.status === 'signed-in' &&
        now - checkedAt.current >= REVISION_CHECK_MS
      ) {
        checkedAt.current = now
        dirty.current = 'account'
      }
      if (dirty.current !== null) schedule()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(timer.current)
    }
  }, [latest, schedule])

  const libraryChanged = useCallback(
    (scope: Scope) => {
      tellOtherTabs({ type: 'library', scope })
      if (scope !== 'account') return
      // After this tab's own change the account's revision is the new baseline.
      void latest()
        .accountRef.current.refresh?.()
        .then((found) => {
          baseline.current = found?.libraryRevision
        })
        .catch(() => undefined)
    },
    [latest],
  )
  return { libraryChanged }
}

import { useCallback, useEffect, useRef } from 'react'
import type { Me } from '@rca/contract'
import type { AccountStatus } from './useAccount'
import { useTabMessages } from './tabSync'
import type { TabMessage } from './tabSync'

/** The least time between two asks made on coming back online or to the tab. */
const RE_ASK_FLOOR_MS = 30_000

/** Said when the server ended the session, here or in another tab. */
export const SESSION_ENDED = 'Your session ended. Sign in to keep saving your activities.'
const SIGNED_OUT_ELSEWHERE = 'You signed out in another tab, so nothing more is saved here.'
const DELETED_ELSEWHERE = 'This account was deleted in another tab, so nothing more is saved here.'

interface AccountTabsDeps {
  status: AccountStatus
  lookupPending: boolean
  /** Reads the account again and adopts the answer. Rejects when the server cannot be reached. */
  refresh: () => Promise<Me | null>
  meRef: { current: Me | null }
  setError: (message: string | null) => void
  /** Takes back the "could not reach the server" the lookup left behind, and no other notice. */
  clearLookupError: () => void
}

/** Said when an account held here could not be checked after another tab changed it. */
const NOT_CONFIRMED =
  'Could not confirm your account just now. If you changed it in another tab, that change may not show here.'

/**
 * Keeps this tab's account in step with the other tabs and with the browser coming back.
 *
 * - After the whole retry ladder failed, coming back online or to the tab asks once more (at most every
 *   30 s), so a signed-in athlete on a flaky link is not left signed out until they reload.
 * - Signed out, coming back to the tab asks once: the session cookie is shared, so a sign-in in another
 *   tab shows here without a reload.
 * - Another tab saving the profile, signing out, deleting the account or finding the session ended makes
 *   a tab that holds an account read it again, once it is in view (a hidden tab waits until it is). A tab
 *   left holding an account that is gone says why, and one that could not check says so. A tab that holds
 *   no account has nothing to update and does not ask.
 */
export function useAccountTabs({
  status,
  lookupPending,
  refresh,
  meRef,
  setError,
  clearLookupError,
}: AccountTabsDeps): void {
  const lapsedRef = useRef(false)
  const signedOutRef = useRef(false)
  useEffect(() => {
    lapsedRef.current = status === 'unavailable' && !lookupPending
    signedOutRef.current = status === 'signed-out'
  }, [status, lookupPending])

  // What another tab said that this tab has not yet acted on, kept while the tab is hidden.
  const heardRef = useRef<TabMessage | null>(null)
  const readHeard = useCallback(() => {
    const heard = heardRef.current
    heardRef.current = null
    if (heard === null || meRef.current === null) return
    refresh()
      .then((found) => {
        if (heard.type !== 'account' || found !== null) return
        if (heard.change === 'signed-out') setError(SIGNED_OUT_ELSEWHERE)
        else if (heard.change === 'deleted') setError(DELETED_ELSEWHERE)
        else setError(SESSION_ENDED)
      })
      .catch(() => setError(NOT_CONFIRMED))
  }, [meRef, refresh, setError])

  useEffect(() => {
    let asking = false
    let askedAt = -Infinity
    const askAgain = (whenSignedOut: boolean) => {
      const wanted = lapsedRef.current || (whenSignedOut && signedOutRef.current)
      if (!wanted || asking || Date.now() - askedAt < RE_ASK_FLOOR_MS) return
      asking = true
      askedAt = Date.now()
      refresh()
        // The answer takes back the "could not reach the server" the lookup left on screen, and only that.
        .then(clearLookupError)
        .catch(() => undefined)
        .finally(() => {
          asking = false
        })
    }
    const onOnline = () => askAgain(false)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      readHeard()
      askAgain(true)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [clearLookupError, readHeard, refresh])

  const onTabMessage = useCallback(
    (message: TabMessage) => {
      if (message.type === 'measurements' || meRef.current === null) return
      heardRef.current = message
      if (document.visibilityState === 'visible') readHeard()
    },
    [meRef, readHeard],
  )
  useTabMessages(onTabMessage)
}

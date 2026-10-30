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
}

/**
 * Keeps this tab's account in step with the other tabs and with the browser coming back.
 *
 * - After the whole retry ladder failed, coming back online or to the tab asks once more (at most every
 *   30 s), so a signed-in athlete on a flaky link is not left signed out until they reload.
 * - Signed out, coming back to the tab asks once: the session cookie is shared, so a sign-in in another
 *   tab shows here without a reload.
 * - Another tab saving the profile, signing out, deleting the account or finding the session ended makes
 *   this tab read the account again. A tab left holding an account that is gone says why.
 */
export function useAccountTabs({
  status,
  lookupPending,
  refresh,
  meRef,
  setError,
}: AccountTabsDeps): void {
  const lapsedRef = useRef(false)
  const signedOutRef = useRef(false)
  useEffect(() => {
    lapsedRef.current = status === 'unavailable' && !lookupPending
    signedOutRef.current = status === 'signed-out'
  }, [status, lookupPending])

  useEffect(() => {
    let asking = false
    let askedAt = -Infinity
    const askAgain = (whenSignedOut: boolean) => {
      const wanted = lapsedRef.current || (whenSignedOut && signedOutRef.current)
      if (!wanted || asking || Date.now() - askedAt < RE_ASK_FLOOR_MS) return
      asking = true
      askedAt = Date.now()
      refresh()
        // The answer takes back the "could not reach the server" the lookup left on screen.
        .then(() => setError(null))
        .catch(() => undefined)
        .finally(() => {
          asking = false
        })
    }
    const onOnline = () => askAgain(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') askAgain(true)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, setError])

  const onTabMessage = useCallback(
    (message: TabMessage) => {
      const heldAccount = meRef.current !== null
      if (message.type === 'profile' && !heldAccount) return
      refresh()
        .then((found) => {
          if (message.type !== 'account' || !heldAccount || found !== null) return
          if (message.change === 'signed-out') setError(SIGNED_OUT_ELSEWHERE)
          else if (message.change === 'deleted') setError(DELETED_ELSEWHERE)
          else if (message.change === 'expired') setError(SESSION_ENDED)
        })
        .catch(() => undefined)
    },
    [meRef, refresh, setError],
  )
  useTabMessages(onTabMessage)
}

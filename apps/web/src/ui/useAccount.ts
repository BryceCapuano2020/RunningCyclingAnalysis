import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Me, ProfileInput } from '@rca/contract'
import * as api from '../api/client'
import { signInUrl } from '../api/client'

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unavailable'

export interface AccountController {
  status: AccountStatus
  me: Me | null
  /** Waits for submitted profile writes and returns the current server-backed account. */
  flushProfileWrites: () => Promise<Me | null>
  signIn: () => void
  /** Rejects with the failure as well as setting `error`, so the caller can show it in place. */
  signOut: () => Promise<void>
  /** Rejects with the failure as well as setting `error`, so the caller can keep its dialog open. */
  deleteAccount: () => Promise<void>
  /** Rejects with the failure after setting `error`, so the caller can restore its pending edit. */
  updateProfile: (input: ProfileInput) => Promise<void>
  /** The last account action's failure, or why the account is unavailable. */
  error: string | null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The signed-in account. 'unavailable' means the API could not answer (offline, a 404 or a 5xx,
 * as on a static host without the API), so the UI should hide the account features.
 */
export function useAccount(): AccountController {
  const [status, setStatus] = useState<AccountStatus>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const meRef = useRef<Me | null>(null)
  const profileWriteFailureRef = useRef<unknown>(null)
  // Profile writes replace the whole profile on the server, so keep them in call order.
  const profileWritesRef = useRef<Promise<void>>(Promise.resolve())
  const endingSessionRef = useRef(false)

  useEffect(() => {
    let current = true
    api.getMe().then(
      (found) => {
        if (!current) return
        meRef.current = found
        profileWriteFailureRef.current = null
        setMe(found)
        setStatus(found ? 'signed-in' : 'signed-out')
      },
      (failure: unknown) => {
        if (!current) return
        meRef.current = null
        setMe(null)
        setStatus('unavailable')
        setError(messageOf(failure))
      },
    )
    return () => {
      current = false
    }
  }, [])

  const signIn = useCallback(() => {
    location.assign(signInUrl)
  }, [])

  const flushProfileWrites = useCallback(async () => {
    await profileWritesRef.current
    if (profileWriteFailureRef.current !== null) throw profileWriteFailureRef.current
    return meRef.current
  }, [])

  const signOut = useCallback(async () => {
    if (endingSessionRef.current) return
    endingSessionRef.current = true
    const userId = me?.user.id
    try {
      await profileWritesRef.current
      await api.logout(userId)
      meRef.current = null
      profileWriteFailureRef.current = null
      setMe(null)
      setStatus('signed-out')
      setError(null)
    } catch (failure) {
      endingSessionRef.current = false
      setError(messageOf(failure))
      throw failure
    }
  }, [me])

  const deleteAccount = useCallback(async () => {
    if (endingSessionRef.current) return
    endingSessionRef.current = true
    const userId = me?.user.id
    try {
      await profileWritesRef.current
      await api.deleteAccount(userId)
      meRef.current = null
      profileWriteFailureRef.current = null
      setMe(null)
      setStatus('signed-out')
      setError(null)
    } catch (failure) {
      endingSessionRef.current = false
      setError(messageOf(failure))
      throw failure
    }
  }, [me])

  const updateProfile = useCallback(
    async (input: ProfileInput) => {
      if (endingSessionRef.current) return
      const userId = me?.user.id
      const write = profileWritesRef.current.then(async () => {
        try {
          const profile = await api.updateProfile(input, userId)
          profileWriteFailureRef.current = null
          const current = meRef.current
          if (current !== null) {
            const updated = { ...current, profile }
            meRef.current = updated
            setMe(updated)
          }
          setError(null)
        } catch (failure) {
          profileWriteFailureRef.current = failure
          setError(messageOf(failure))
          throw failure
        }
      })
      // Keep the queue usable after a failed write while returning that failure to the caller.
      profileWritesRef.current = write.catch(() => undefined)
      await write
    },
    [me],
  )

  return useMemo(
    () => ({
      status,
      me,
      signIn,
      signOut,
      deleteAccount,
      updateProfile,
      flushProfileWrites,
      error,
    }),
    [status, me, signIn, signOut, deleteAccount, updateProfile, flushProfileWrites, error],
  )
}

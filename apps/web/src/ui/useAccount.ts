import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Me, ProfileInput } from '@rca/contract'
import * as api from '../api/client'
import { signInUrl } from '../api/client'

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unavailable'

export interface AccountController {
  status: AccountStatus
  me: Me | null
  signIn: () => void
  /** Rejects with the failure as well as setting `error`, so the caller can show it in place. */
  signOut: () => Promise<void>
  /** Rejects with the failure as well as setting `error`, so the caller can keep its dialog open. */
  deleteAccount: () => Promise<void>
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

  useEffect(() => {
    let current = true
    api.getMe().then(
      (found) => {
        if (!current) return
        setMe(found)
        setStatus(found ? 'signed-in' : 'signed-out')
      },
      (failure: unknown) => {
        if (!current) return
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

  const signOut = useCallback(async () => {
    try {
      await api.logout()
      setMe(null)
      setStatus('signed-out')
      setError(null)
    } catch (failure) {
      setError(messageOf(failure))
      throw failure
    }
  }, [])

  const deleteAccount = useCallback(async () => {
    try {
      await api.deleteAccount()
      setMe(null)
      setStatus('signed-out')
      setError(null)
    } catch (failure) {
      setError(messageOf(failure))
      throw failure
    }
  }, [])

  const updateProfile = useCallback(async (input: ProfileInput) => {
    try {
      const profile = await api.updateProfile(input)
      setMe((previous) => (previous === null ? null : { ...previous, profile }))
      setError(null)
    } catch (failure) {
      setError(messageOf(failure))
    }
  }, [])

  return useMemo(
    () => ({ status, me, signIn, signOut, deleteAccount, updateProfile, error }),
    [status, me, signIn, signOut, deleteAccount, updateProfile, error],
  )
}

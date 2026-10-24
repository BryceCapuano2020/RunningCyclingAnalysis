import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Me, Profile, ProfileInput } from '@rca/contract'
import * as api from '../api/client'
import { ApiRequestError, signInUrl } from '../api/client'

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unavailable'

export interface AccountController {
  status: AccountStatus
  me: Me | null
  /** True when the server ended the session without the user signing out. */
  sessionExpired: boolean
  /** Waits for submitted profile writes and returns the current server-backed account. */
  flushProfileWrites: () => Promise<Me | null>
  signIn: () => void
  /** Rejects with the failure as well as setting `error`, so the caller can show it in place. */
  signOut: () => Promise<void>
  /** Rejects with the failure as well as setting `error`, so the caller can keep its dialog open. */
  deleteAccount: () => Promise<void>
  /**
   * Saves the given fields, merged onto the latest saved profile. Resolves with the profile the
   * server stored. Rejects with the failure, and `error` is set, so the caller can show it. It also
   * rejects when nobody is signed in or the sign-out has begun, rather than pretending to save.
   */
  updateProfile: (patch: Partial<ProfileInput>) => Promise<Profile>
  /** Ends the session after the server refused it. Does not call the server. */
  markExpired: () => void
  /** Fetches the server's current account and adopts it. Rejects when the server cannot be reached. */
  refresh: () => Promise<Me | null>
  /** The last account action's failure, or why the account is unavailable. */
  error: string | null
}

/** Waits before each retry of the first account lookup: 1 s, 3 s, then 10 s. */
const LOOKUP_RETRY_DELAYS_MS = [1_000, 3_000, 10_000]

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isUnauthenticated(failure: unknown): boolean {
  return failure instanceof ApiRequestError && failure.status === 401
}

/**
 * The saved profile with only the given fields changed. The bike mass and the required settings are
 * sent with their saved values standing in. The body mass, the optional year of birth and sex are
 * sent only when the patch sets them, so a write that does not mention them leaves the server's
 * values alone. A body mass the patch sets, null included, is sent as it is, so null clears it.
 */
function mergeProfile(saved: Profile, patch: Partial<ProfileInput>): ProfileInput {
  const fields: ProfileInput = {
    bikeMassKg: patch.bikeMassKg ?? saved.bikeMassKg,
    units: patch.units ?? saved.units,
    keepFiles: patch.keepFiles ?? saved.keepFiles,
  }
  if (patch.massKg !== undefined) fields.massKg = patch.massKg
  if (patch.birthYear !== undefined) fields.birthYear = patch.birthYear
  if (patch.sex !== undefined) fields.sex = patch.sex
  return fields
}

/**
 * The signed-in account. 'unavailable' means the API could not answer after retries (offline, a
 * 404 or a 5xx, as on a static host without the API), so the UI should hide the account features.
 */
export function useAccount(): AccountController {
  const [status, setStatus] = useState<AccountStatus>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meRef = useRef<Me | null>(null)
  const profileWriteFailureRef = useRef<unknown>(null)
  // Profile writes replace the whole profile on the server, so keep them in call order.
  const profileWritesRef = useRef<Promise<unknown>>(Promise.resolve())
  const endingSessionRef = useRef(false)

  /** Adopts the server's view of the account. A saved view supersedes a failed write. */
  const adopt = useCallback((found: Me | null) => {
    const wasSignedIn = meRef.current !== null
    meRef.current = found
    profileWriteFailureRef.current = null
    setMe(found)
    setStatus(found ? 'signed-in' : 'signed-out')
    setSessionExpired(found === null && wasSignedIn)
  }, [])

  const refresh = useCallback(async () => {
    const found = await api.getMe()
    adopt(found)
    return found
  }, [adopt])

  const expireSession = useCallback(() => {
    if (meRef.current === null) return
    meRef.current = null
    setMe(null)
    setStatus('signed-out')
    setSessionExpired(true)
    setError('Your session ended. Sign in to keep saving your activities.')
  }, [])

  useEffect(() => {
    let current = true
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retries = 0
    const lookup = () => {
      api.getMe().then(
        (found) => {
          if (!current) return
          adopt(found)
        },
        (failure: unknown) => {
          if (!current) return
          const delay = LOOKUP_RETRY_DELAYS_MS[retries]
          if (delay !== undefined) {
            retries++
            retryTimer = setTimeout(lookup, delay)
            return
          }
          meRef.current = null
          setMe(null)
          setStatus('unavailable')
          setError(messageOf(failure))
        },
      )
    }
    lookup()
    return () => {
      current = false
      clearTimeout(retryTimer)
    }
  }, [adopt])

  const signIn = useCallback(() => {
    location.assign(signInUrl)
  }, [])

  const flushProfileWrites = useCallback(async () => {
    await profileWritesRef.current
    // A failed write leaves the saved profile unknown. Read it again before anything depends on it.
    if (profileWriteFailureRef.current !== null) await refresh()
    return meRef.current
  }, [refresh])

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
      setSessionExpired(false)
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
      setSessionExpired(false)
      setError(null)
    } catch (failure) {
      endingSessionRef.current = false
      setError(messageOf(failure))
      throw failure
    }
  }, [me])

  const updateProfile = useCallback(
    async (patch: Partial<ProfileInput>): Promise<Profile> => {
      const userId = meRef.current?.user.id
      if (endingSessionRef.current) {
        setError('This change was not saved, because the account is being signed out or deleted.')
        throw new ApiRequestError(401, 'unauthenticated', 'Sign in required')
      }
      if (userId === undefined) {
        throw new ApiRequestError(401, 'unauthenticated', 'Sign in required')
      }
      const write = profileWritesRef.current.then(async (): Promise<Profile> => {
        try {
          // Read the saved profile right before writing, so a change made in another tab survives.
          const latest = await api.getMe()
          if (latest === null) throw new ApiRequestError(401, 'unauthenticated', 'Sign in required')
          if (latest.user.id !== userId) {
            throw new ApiRequestError(409, 'account_changed', 'The signed-in account changed')
          }
          const profile = await api.updateProfile(mergeProfile(latest.profile, patch), userId)
          profileWriteFailureRef.current = null
          const current = meRef.current
          if (current !== null) {
            const updated = { ...current, profile }
            meRef.current = updated
            setMe(updated)
          }
          setError(null)
          return profile
        } catch (failure) {
          profileWriteFailureRef.current = failure
          setError(messageOf(failure))
          if (isUnauthenticated(failure)) {
            expireSession()
          } else {
            // Adopt the saved profile now. If the server cannot be read, the next flush retries.
            await refresh().catch(() => undefined)
          }
          throw failure
        }
      })
      // Keep the queue usable after a failed write while returning that failure to the caller.
      profileWritesRef.current = write.catch(() => undefined)
      return write
    },
    [expireSession, refresh],
  )

  return useMemo(
    () => ({
      status,
      me,
      sessionExpired,
      signIn,
      signOut,
      deleteAccount,
      updateProfile,
      markExpired: expireSession,
      refresh,
      flushProfileWrites,
      error,
    }),
    [
      status,
      me,
      sessionExpired,
      signIn,
      signOut,
      deleteAccount,
      updateProfile,
      expireSession,
      refresh,
      flushProfileWrites,
      error,
    ],
  )
}

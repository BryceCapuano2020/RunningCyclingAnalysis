import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Me, Profile, ProfileInput } from '@rca/contract'
import * as api from '../api/client'
import { ApiRequestError, signInUrl } from '../api/client'
import { messageOf } from '../api/messageOf'
import { deleteAccountDetails } from '../worker/deleteAccountDetails'
import { forgetAccountDetails } from '../worker/forgetAccountDetails'
import { sweepAccountDetails } from '../worker/sweepAccountDetails'
import { tellOtherTabs } from './tabSync'
import { SESSION_ENDED, useAccountTabs } from './useAccountTabs'

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
  /**
   * True while the account is unavailable but the lookup will be tried again, so the visitor may yet
   * turn out to be signed in. Nothing is kept on this device until it is false.
   */
  lookupPending: boolean
}

/** Waits before each retry of a failed account lookup: 1 s, 3 s, then 10 s. */
const LOOKUP_RETRY_DELAYS_MS = [1_000, 3_000, 10_000]

/**
 * How one lookup attempt is made while later attempts remain: a short deadline, and an immediate
 * second try only for a failure that came at once (a refused connection), never for a timeout, so a
 * hung API costs one short wait and not two. A returning visitor's results do not wait on the lookup
 * (the kept library loads after a short grace), so a slow API costs nothing but the account features.
 * The last attempt uses the normal deadline, so a slow link that needs longer is not signed out for
 * good.
 */
const LOOKUP_ATTEMPT = { timeoutMs: 5_000, retryWithinMs: 1_000 } as const

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
 * The signed-in account. 'unavailable' means the API could not answer (offline, a 404 or a 5xx, as
 * on a static host without the API), so the UI should hide the account features. It is reported as
 * soon as the first lookup fails, and the lookup is retried in the background: signed-out use never
 * waits on the API, and an import started meanwhile is not repeated when the retries give up.
 */
export function useAccount(): AccountController {
  const [status, setStatus] = useState<AccountStatus>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupPending, setLookupPending] = useState(false)
  const meRef = useRef<Me | null>(null)
  const profileWriteFailureRef = useRef<unknown>(null)
  // Profile writes replace the whole profile on the server, so keep them in call order.
  const profileWritesRef = useRef<Promise<unknown>>(Promise.resolve())
  const endingSessionRef = useRef(false)
  // The error the account lookup itself left, so only it is taken back when a later ask gets through.
  const lookupErrorRef = useRef<string | null>(null)
  const clearLookupError = useCallback(
    () => setError((shown) => (shown !== null && shown === lookupErrorRef.current ? null : shown)),
    [],
  )

  /**
   * Clears an account's detail recordings from this browser once the account is no longer this
   * browser's, as an explicit sign-out does. Only that account's scope: the signed-out library stays.
   */
  const forgetEnded = useCallback((userId: string, keepSaves = false) => {
    void forgetAccountDetails(userId, keepSaves).then((notice) => {
      if (notice !== null) setError((earlier) => (earlier ? `${earlier} ${notice}` : notice))
    })
  }, [])

  /** Adopts the server's view of the account. A saved view supersedes a failed write. */
  const adopt = useCallback(
    (found: Me | null) => {
      const previous = meRef.current
      const wasSignedIn = previous !== null
      meRef.current = found
      // The session ended, or another account signed in, without a sign-out here. The server ended it, not the
      // athlete, so what was waiting to be saved waits for the next sign-in, as it does when a save finds the
      // session expired. (A sign-out in another tab asked first and forgot them there.)
      if (previous !== null && previous.user.id !== found?.user.id)
        forgetEnded(previous.user.id, true)
      // A definite answer: any other account's recordings are not this browser's to keep, even one
      // that ended while no tab was open.
      void sweepAccountDetails(found?.user.id ?? null)
      profileWriteFailureRef.current = null
      setMe(found)
      setStatus(found ? 'signed-in' : 'signed-out')
      setSessionExpired(found === null && wasSignedIn)
    },
    [forgetEnded],
  )

  const refresh = useCallback(async () => {
    const found = await api.getMe()
    adopt(found)
    return found
  }, [adopt])

  const expireSession = useCallback(() => {
    const ended = meRef.current
    if (ended === null) return
    meRef.current = null
    setMe(null)
    setStatus('signed-out')
    setSessionExpired(true)
    setError(SESSION_ENDED)
    // The server ended it, not the athlete: what was waiting to be saved waits for the next sign-in.
    forgetEnded(ended.user.id, true)
    void sweepAccountDetails(null)
    tellOtherTabs({ type: 'account', change: 'expired' })
  }, [forgetEnded])

  useEffect(() => {
    let current = true
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retries = 0
    let failed = false
    const lookup = () => {
      const lastAttempt = retries >= LOOKUP_RETRY_DELAYS_MS.length
      api.getMe(lastAttempt ? undefined : LOOKUP_ATTEMPT).then(
        (found) => {
          if (!current) return
          adopt(found)
          setLookupPending(false)
          // A retry that got through takes back the account's earlier "unavailable".
          if (failed) clearLookupError()
        },
        (failure: unknown) => {
          if (!current) return
          // Nobody is known to be signed in, so the visitor works as a signed-out one at once: the
          // browser's own library and files do not wait on the API. The lookup goes on in the
          // background, and a retry that finds an account signs it in as any later sign-in.
          const delay = LOOKUP_RETRY_DELAYS_MS[retries]
          meRef.current = null
          setMe(null)
          setStatus('unavailable')
          // The first miss is usually a slow moment the retry clears, so it says nothing; a second
          // miss, or the last one, does.
          if (failed || delay === undefined) {
            lookupErrorRef.current = messageOf(failure)
            setError(lookupErrorRef.current)
          }
          failed = true
          setLookupPending(delay !== undefined)
          if (delay !== undefined) {
            retries++
            retryTimer = setTimeout(lookup, delay)
          }
        },
      )
    }
    lookup()
    return () => {
      current = false
      clearTimeout(retryTimer)
    }
  }, [adopt, clearLookupError])

  useAccountTabs({ status, lookupPending, refresh, meRef, setError, clearLookupError })

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
      tellOtherTabs({ type: 'account', change: 'signed-out' })
      meRef.current = null
      profileWriteFailureRef.current = null
      setMe(null)
      setStatus('signed-out')
      setSessionExpired(false)
      setError(null)
      // A shared browser must not keep the signed-out account's detail recordings.
      setError(await forgetAccountDetails(userId))
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
      tellOtherTabs({ type: 'account', change: 'deleted' })
      const cleanupNotice = await deleteAccountDetails(userId)
      meRef.current = null
      profileWriteFailureRef.current = null
      setMe(null)
      setStatus('signed-out')
      setSessionExpired(false)
      setError(cleanupNotice)
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
          tellOtherTabs({ type: 'profile' })
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
      lookupPending,
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
      lookupPending,
    ],
  )
}

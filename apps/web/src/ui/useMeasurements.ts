import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { withEntry, withoutEntry, measurementKey } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import { deleteMeasurement, listMeasurements, putMeasurement } from '../api/measurements'
import { loadMeasurements, sortedMeasurements, storeMeasurements } from './measurementStore'
import type { AccountStatus } from './useAccount'

const NOT_KEPT = 'This browser would not keep the setting. Check that it may store site data.'
const NO_ENTRIES: readonly Measurement[] = []

/** Why a weight cannot be saved, or the data downloaded, until the account's dated settings are known. */
export const SETTINGS_NOT_READY = {
  loading: 'Your dated settings are still loading. Try again in a moment.',
  failed: 'Your dated settings could not be loaded. Use Try again under Settings over time.',
} as const

/** How long the first failed load waits before its one automatic retry. */
export const AUTO_RETRY_MS = 2000

export interface MeasurementsController {
  /** The dated settings, earliest date first. The same array until a setting changes. */
  entries: readonly Measurement[]
  /** 'loading' while the account's list is read, 'failed' when it could not be. */
  state: 'ready' | 'loading' | 'failed'
  /** Signed in: how many dated settings this browser holds from before, which are not the account's. */
  elsewhere: number
  /**
   * Resolves with the dated settings once they are known, waiting while they load, and rejects when
   * they could not be loaded. A save that depends on them waits here rather than guess.
   */
  whenReady: () => Promise<readonly Measurement[]>
  /** Loads the account's list again after it failed. */
  retry: () => void
  /** Sets the value in effect from a date, replacing one for the same kind, sport and date. */
  add: (entry: Measurement) => Promise<Measurement[]>
  remove: (entry: Measurement) => Promise<Measurement[]>
}

/**
 * The athlete's dated settings. Signed in, the account keeps them: this reads and writes them through
 * the API, and there are none to use until the account's list has arrived (state 'loading'). Signed
 * out, and while the sign-in is still being looked up, the list kept in this browser is used. A write
 * resolves with the new list once it is stored, and rejects, changing nothing, when it is refused.
 * The browser's own list is left as it was when signed in; it is not merged into the account.
 *
 * A load that fails is tried once more after a short wait, and then reported as 'failed' until
 * `retry` is called.
 */
export function useMeasurements(
  status: AccountStatus,
  userId: string | null,
): MeasurementsController {
  const signedIn = status === 'signed-in' && userId !== null
  const [device, setDevice] = useState(loadMeasurements)
  const [account, setAccount] = useState<{ userId: string; entries: Measurement[] } | null>(null)
  // The account whose list could not be loaded, so another account does not inherit the failure.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  // Which try this is: the first, its automatic retry, then any the athlete asks for.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!signedIn) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    listMeasurements(userId).then(
      (items) => {
        if (!current) return
        setFailedFor(null)
        setAccount({ userId, entries: sortedMeasurements(items) })
      },
      () => {
        if (!current) return
        if (attempt === 0) timer = setTimeout(() => setAttempt(1), AUTO_RETRY_MS)
        else setFailedFor(userId)
      },
    )
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [signedIn, userId, attempt])

  const accountEntries = account !== null && account.userId === userId ? account.entries : null
  const loaded = signedIn && accountEntries !== null
  const entries = useMemo(
    () => (signedIn ? (accountEntries ?? NO_ENTRIES) : device),
    [signedIn, accountEntries, device],
  )

  let state: MeasurementsController['state'] = 'ready'
  if (signedIn && !loaded) state = failedFor === userId ? 'failed' : 'loading'

  // The latest list and state, for a save that waited and so was made in an older render.
  const latest = useRef({ entries, state })
  const waiting = useRef<
    { resolve: (e: readonly Measurement[]) => void; reject: (e: Error) => void }[]
  >([])
  useLayoutEffect(() => {
    latest.current = { entries, state }
    if (state === 'loading') return
    for (const waiter of waiting.current.splice(0)) {
      if (state === 'ready') waiter.resolve(entries)
      else waiter.reject(new Error(SETTINGS_NOT_READY.failed))
    }
  }, [entries, state])

  const whenReady = useCallback((): Promise<readonly Measurement[]> => {
    const { entries: held, state: now } = latest.current
    if (now === 'ready') return Promise.resolve(held)
    if (now === 'failed') return Promise.reject(new Error(SETTINGS_NOT_READY.failed))
    return new Promise((resolve, reject) => waiting.current.push({ resolve, reject }))
  }, [])

  const retry = useCallback(() => {
    setFailedFor(null)
    setAttempt((tries) => tries + 1)
  }, [])

  // Writes run one at a time, each building its list from the one before it stored, so two quick
  // writes keep both changes, and a removal cannot bring back a row an earlier write replaced.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const commit = useCallback(
    (build: (current: readonly Measurement[]) => Measurement[], write: () => Promise<unknown>) => {
      const run = async (): Promise<Measurement[]> => {
        const sorted = sortedMeasurements(build(latest.current.entries))
        if (signedIn) {
          await write()
          setAccount({ userId, entries: sorted })
        } else {
          if (!storeMeasurements(sorted)) throw new Error(NOT_KEPT)
          setDevice(sorted)
        }
        latest.current = { ...latest.current, entries: sorted }
        return sorted
      }
      // A refused write rejects only its own caller; the writes behind it still go ahead.
      const result = queue.current.then(run, run)
      queue.current = result.catch(() => undefined)
      return result
    },
    [signedIn, userId],
  )

  const add = useCallback(
    (entry: Measurement) =>
      commit(
        (current) => withEntry(current, entry),
        () => putMeasurement({ ...entry }, userId ?? undefined),
      ),
    [commit, userId],
  )

  const remove = useCallback(
    (entry: Measurement) =>
      commit(
        (current) => withoutEntry(current, measurementKey(entry)),
        () => deleteMeasurement(entry, userId ?? undefined),
      ),
    [commit, userId],
  )

  return { entries, state, elsewhere: signedIn ? device.length : 0, whenReady, retry, add, remove }
}

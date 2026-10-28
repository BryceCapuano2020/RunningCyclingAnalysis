import { useCallback, useEffect, useMemo, useState } from 'react'
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
  failed: 'Your dated settings could not be loaded. Reload the page and try again.',
} as const

export interface MeasurementsController {
  /** The dated settings, earliest date first. The same array until a setting changes. */
  entries: readonly Measurement[]
  /** 'loading' while the account's list is read, 'failed' when it could not be. */
  state: 'ready' | 'loading' | 'failed'
  /** Signed in: how many dated settings this browser holds from before, which are not the account's. */
  elsewhere: number
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
 */
export function useMeasurements(
  status: AccountStatus,
  userId: string | null,
): MeasurementsController {
  const signedIn = status === 'signed-in' && userId !== null
  const [device, setDevice] = useState(loadMeasurements)
  const [account, setAccount] = useState<{ userId: string; entries: Measurement[] } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    let current = true
    listMeasurements(userId).then(
      (items) => {
        if (!current) return
        setFailed(false)
        setAccount({ userId, entries: sortedMeasurements(items) })
      },
      () => {
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [signedIn, userId])

  const accountEntries = account !== null && account.userId === userId ? account.entries : null
  const loaded = signedIn && accountEntries !== null
  const entries = useMemo(
    () => (signedIn ? (accountEntries ?? NO_ENTRIES) : device),
    [signedIn, accountEntries, device],
  )

  const commit = useCallback(
    async (next: Measurement[], write: () => Promise<unknown>) => {
      const sorted = sortedMeasurements(next)
      if (signedIn) {
        await write()
        setAccount({ userId, entries: sorted })
      } else {
        if (!storeMeasurements(sorted)) throw new Error(NOT_KEPT)
        setDevice(sorted)
      }
      return sorted
    },
    [signedIn, userId],
  )

  const add = useCallback(
    (entry: Measurement) =>
      commit(withEntry(entries, entry), () => putMeasurement({ ...entry }, userId ?? undefined)),
    [commit, entries, userId],
  )

  const remove = useCallback(
    (entry: Measurement) =>
      commit(withoutEntry(entries, measurementKey(entry)), () =>
        deleteMeasurement(entry, userId ?? undefined),
      ),
    [commit, entries, userId],
  )

  let state: MeasurementsController['state'] = 'ready'
  if (signedIn && !loaded) state = failed ? 'failed' : 'loading'
  return { entries, state, elsewhere: signedIn ? device.length : 0, add, remove }
}

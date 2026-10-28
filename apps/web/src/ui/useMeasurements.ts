import { useCallback, useEffect, useMemo, useState } from 'react'
import { withEntry, withoutEntry, measurementKey } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import { deleteMeasurement, listMeasurements, putMeasurement } from '../api/measurements'
import { loadMeasurements, sortedMeasurements, storeMeasurements } from './measurementStore'
import type { AccountStatus } from './useAccount'

const NOT_KEPT = 'This browser would not keep the setting. Check that it may store site data.'
const NO_ENTRIES: readonly Measurement[] = []

export interface MeasurementsController {
  /** The dated settings, earliest date first. The same array until a setting changes. */
  entries: readonly Measurement[]
  /** 'loading' while the account's list is read, 'failed' when it could not be. */
  state: 'ready' | 'loading' | 'failed'
  /** Sets the value in effect from a date, replacing one for the same kind, sport and date. */
  add: (entry: Measurement) => Promise<Measurement[]>
  remove: (entry: Measurement) => Promise<Measurement[]>
}

/**
 * The athlete's dated settings. Signed in, the account keeps them and this reads and writes through
 * the API. Signed out, and while the account is still loading, this browser keeps them. A write
 * resolves with the new list once it is stored, and rejects, changing nothing, when it is refused.
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
  return { entries, state, add, remove }
}

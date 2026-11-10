import { useCallback, useEffect, useState } from 'react'
import type { Me } from '@rca/contract'
import { createLiftTransport } from '../../api/lifts'
import { deviceLiftCount } from '../../worker/liftCounts'
import { clearScope, openLiftStore } from '../../worker/liftStore'
import { createLiftSync } from '../../worker/liftSync'
import type { AdoptResult } from '../../worker/liftSync'
import type { LiftTransport } from '../../worker/liftTransport'
import { DEVICE_SCOPE } from '../../worker/liftTransitions'

/** How adding the device's lifting sets ended, with how many there were to add. */
export type LiftAdoption = AdoptResult & { total: number }

export interface DeviceLifts {
  /** Lifting sets this browser kept from before sign-in; null until they are counted. */
  count: number | null
  /** Sends them to the account without replacing any it holds, and clears the ones sent. */
  adopt: () => Promise<void>
  /** An adoption is running. */
  adopting: boolean
  /** Removes them from this browser. */
  forget: () => Promise<void>
  /** How the last adoption ended, until it is dismissed. */
  result: LiftAdoption | null
  dismissResult: () => void
}

export interface DeviceLiftsAccount {
  /** Reads `/api/me` again, so the account's revision moves the log's pull. */
  refresh: () => Promise<Me | null>
  /** Ends the session after the send was refused as signed out. */
  markExpired: () => void
}

/** The lifting sets kept on the device, offered to the account that is signed in. Nothing is read signed out. */
export function useDeviceLifts(
  userId: string | undefined,
  account: DeviceLiftsAccount,
  transportFor: (id: string) => LiftTransport = createLiftTransport,
): DeviceLifts {
  const [counted, setCount] = useState<number | null>(null)
  const [adopting, setAdopting] = useState(false)
  const [result, setResult] = useState<LiftAdoption | null>(null)
  useEffect(() => {
    let live = true
    if (userId === undefined) return
    deviceLiftCount().then(
      (found) => live && setCount(found),
      () => live && setCount(0),
    )
    return () => {
      live = false
    }
  }, [userId])

  const { refresh, markExpired } = account
  const adopt = useCallback(async () => {
    if (userId === undefined || adopting) return
    setAdopting(true)
    const device = openLiftStore(DEVICE_SCOPE)
    const mine = openLiftStore(userId)
    try {
      const total = await deviceLiftCount()
      const done = await createLiftSync({ store: mine, transport: transportFor(userId) }).adopt(
        device,
      )
      if (done.unauthorized) markExpired()
      setResult({ ...done, total })
      setCount(await deviceLiftCount())
      // The account's revision moved with the sets it took: read it, so the log pulls them.
      await refresh().catch(() => null)
    } finally {
      device.close()
      mine.close()
      setAdopting(false)
    }
  }, [userId, adopting, transportFor, refresh, markExpired])

  const forget = useCallback(async () => {
    await clearScope(DEVICE_SCOPE)
    setCount(0)
  }, [])

  return {
    count: userId === undefined ? null : counted,
    adopt,
    adopting,
    forget,
    result,
    dismissResult: () => setResult(null),
  }
}

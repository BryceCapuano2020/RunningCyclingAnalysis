import { useCallback, useEffect, useRef, useState } from 'react'
import { createLiftTransport } from '../../api/lifts'
import { clearScope, openLiftStore } from '../../worker/liftStore'
import { createLiftSync } from '../../worker/liftSync'
import type { AdoptResult } from '../../worker/liftSync'
import type { LiftTransport } from '../../worker/liftTransport'
import { DEVICE_SCOPE } from '../../worker/liftTransitions'
import type { AdoptionOutcome } from '../analysis/model'

export interface DeviceLifts {
  /** Lifting sets this browser kept from before sign-in. */
  count: number
  /** Sends them to the account without replacing any it holds, and clears the ones sent. */
  adopt: () => Promise<AdoptResult | null>
  /** Removes them from this browser. */
  forget: () => Promise<void>
  /** How the last adoption ended, until it is dismissed. */
  result: AdoptResult | null
  dismissResult: () => void
}

/** The lifting sets kept on the device, offered to the account that is signed in. Nothing is read signed out. */
export function useDeviceLifts(
  userId: string | undefined,
  transportFor: (id: string) => LiftTransport = createLiftTransport,
): DeviceLifts {
  const [counted, setCount] = useState(0)
  const [result, setResult] = useState<AdoptResult | null>(null)
  const read = useCallback(async () => {
    const rows = await openLiftStore(DEVICE_SCOPE).list()
    return rows.filter((row) => row.state === 'put').length
  }, [])
  useEffect(() => {
    let live = true
    if (userId === undefined) return
    void read().then(
      (found) => live && setCount(found),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [userId, read])

  const adopt = useCallback(async () => {
    if (userId === undefined) return null
    const device = openLiftStore(DEVICE_SCOPE)
    const engine = createLiftSync({
      store: openLiftStore(userId),
      transport: transportFor(userId),
    })
    const done = await engine.adopt(device)
    setResult(done)
    setCount(await read())
    return done
  }, [userId, read, transportFor])

  const forget = useCallback(async () => {
    await clearScope(DEVICE_SCOPE)
    setCount(0)
  }, [])

  return {
    count: userId === undefined ? 0 : counted,
    adopt,
    forget,
    result,
    dismissResult: () => setResult(null),
  }
}

/**
 * Runs the lift adoption after the activities adoption has ended (`adoption` arrives), or at once when no activity
 * is being added. The offer's one Add button calls `add`.
 */
export function useAddWithLifts(
  lifts: DeviceLifts,
  adoption: AdoptionOutcome | null,
  addActivities: () => void,
) {
  const waiting = useRef(false)
  const { adopt } = lifts
  useEffect(() => {
    if (!waiting.current || adoption === null) return
    waiting.current = false
    void adopt().catch(() => undefined)
  }, [adoption, adopt])
  return useCallback(
    (activities: boolean) => {
      if (activities) {
        waiting.current = true
        addActivities()
      } else void adopt().catch(() => undefined)
    },
    [addActivities, adopt],
  )
}

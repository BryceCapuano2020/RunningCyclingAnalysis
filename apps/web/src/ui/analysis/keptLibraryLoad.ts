import { useCallback, useEffect, useRef, useState } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest } from '../../worker/protocol'
import { storedPeriodRequest } from '../periodPreference'
import { keptLibraryHinted } from './keptLibrary'
import { accountPending, drainBatches } from './model'
import type { Account, Box } from './model'
import type { WorkerTransport } from './workerTransport'

/**
 * How long a returning visitor's kept results wait for the account to answer before they show,
 * counted from when the page opened. An account that answers within it never sees the browser's own
 * library on screen.
 */
export const DEVICE_GRACE_MS = 300

interface KeptLibraryLoadDeps {
  accountRef: Box<Account>
  settingsRef: Box<AthleteSettings>
  send: WorkerTransport['send']
  /** Whether a worker is running. A first visit has none until a request needs one. */
  workerRunning: () => boolean
  /** Files analysed while the account is unknown, to be sent again once it is. */
  provisionalImportsRef: Box<File[][]>
  /** Imports that wait for a library read; the reply to the read adds them. */
  libraryWaitRef: Box<File[][]>
}

/**
 * Each worker starts from the library kept in this browser, once, when nobody is signed in. A visit
 * that kept results (the hint) does not wait for the account lookup to show them: while the account is
 * still unknown (loading, or out of reach and about to be asked again), the kept library loads once the
 * grace has passed, so a fast answer from a signed-in account never shows the browser's own library.
 * Without the hint there is nothing to show, so an account that is still loading is waited for.
 */
export function useKeptLibraryLoad({
  accountRef,
  settingsRef,
  send,
  workerRunning,
  provisionalImportsRef,
  libraryWaitRef,
}: KeptLibraryLoadDeps) {
  const deviceLoadedRef = useRef(false)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [graceEndsAt] = useState(() => Date.now() + DEVICE_GRACE_MS)
  // The timer asks again with whatever the account is by then.
  const askAgainRef = useRef<() => void>(() => undefined)

  const sendLoadDevice = useCallback(() => {
    deviceLoadedRef.current = true
    // Files analysed while the account was unknown were analysed without the kept library, and this
    // read replaces the session's library, so they wait for it and are added again once it has loaded.
    libraryWaitRef.current.push(...drainBatches(provisionalImportsRef))
    const request: WorkerRequest = {
      type: 'loadDevice',
      settings: settingsRef.current,
      ...storedPeriodRequest(),
    }
    send(request)
  }, [libraryWaitRef, provisionalImportsRef, send, settingsRef])

  const loadDeviceOnce = useCallback(() => {
    // Without a worker the read would start one for a visit that may have nothing kept. The worker asks
    // for it as it starts, so the first request that needs a worker brings the kept library with it.
    if (deviceLoadedRef.current || !workerRunning()) return
    const account = accountRef.current
    const unknown = accountPending(account)
    clearTimeout(graceTimerRef.current)
    if (!unknown && account.status !== 'signed-out' && account.status !== 'unavailable') return
    if (!unknown) {
      sendLoadDevice()
      return
    }
    if (!keptLibraryHinted()) {
      // Out of reach and unhinted: nothing waits for the account to be known, as before.
      if (account.status === 'unavailable') sendLoadDevice()
      return
    }
    const wait = graceEndsAt - Date.now()
    if (wait <= 0) {
      sendLoadDevice()
      return
    }
    graceTimerRef.current = setTimeout(() => {
      // A sign-in answer may have arrived but not yet been committed here. If so, the transition that
      // commits it drops the kept library again (the signed-in path clears it), so the worst case is
      // a brief flash, never a mixed library.
      askAgainRef.current()
    }, wait)
  }, [accountRef, graceEndsAt, sendLoadDevice, workerRunning])

  useEffect(() => {
    askAgainRef.current = loadDeviceOnce
  }, [loadDeviceOnce])
  useEffect(() => () => clearTimeout(graceTimerRef.current), [])

  return { deviceLoadedRef, loadDeviceOnce }
}

import { useCallback, useEffect, useState } from 'react'
import type { AccountStatus } from './useAccount'
import type { ProfilePatch } from './profilePatch'

/** Set on a device once setup is answered while signed in. Signed out, the preferences hold it. */
const DEVICE_SETUP_KEY = 'rca.setup.v1'

function deviceSetupDone(): boolean {
  try {
    return localStorage.getItem(DEVICE_SETUP_KEY) === '1'
  } catch {
    return false
  }
}

function markDeviceSetupDone() {
  try {
    localStorage.setItem(DEVICE_SETUP_KEY, '1')
  } catch {
    // Storage can be unavailable; the questions are then asked once more on this device.
  }
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Your answers could not be saved. Try again.'
}

export interface SetupOptions {
  /** While the account loads, files wait without asking, since the answer depends on who is signed in. */
  status: AccountStatus
  /** The worker has stopped for good. Imports then go straight through, so its stopped message shows. */
  workerStopped: boolean
  /** Whether a signed-out visitor has answered setup on this device, from the saved preferences. */
  preferencesDone: boolean
  addFiles: (files: File[]) => void
  /** Stores the answers. Resolves once they are stored, and rejects with the reason when they are not. */
  save: (patch: ProfilePatch) => Promise<void>
}

interface Ready {
  files: File[]
  add: (files: File[]) => void
}

export interface SetupController {
  /** Whether the setup dialog should be shown. */
  open: boolean
  /** How many files are waiting: for the account to be known, or for the answers. */
  held: number
  /** Whether the answers are being stored. */
  saving: boolean
  /** Why the answers could not be stored. The files stay held until they are. */
  saveError: string | null
  /** Every import goes through here. Files wait, and the dialog opens, until setup is answered. */
  requestImport: (files: File[]) => void
  /**
   * Stores the values the athlete changed, then sends the held files. Skip passes an empty patch.
   * A refusal is kept in saveError and nothing is sent.
   */
  finish: (patch: ProfilePatch) => Promise<void>
}

/**
 * Asks the first-analysis questions once per device. Files dropped or chosen before then wait,
 * further files join them, and all of them are analysed together once the answers are stored.
 * The sample never comes through here, so it never asks.
 */
export function useSetup({
  status,
  workerStopped,
  preferencesDone,
  addFiles,
  save,
}: SetupOptions): SetupController {
  const signedIn = status === 'signed-in'
  const [deviceDone, setDeviceDone] = useState(deviceSetupDone)
  const done = signedIn ? deviceDone : preferencesDone
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Files waiting for the athlete's answer, or for the account to be known.
  const [held, setHeld] = useState<File[]>([])
  // Files whose answer is in place, handed to addFiles by the effect below.
  const [ready, setReady] = useState<Ready | null>(null)
  const open = held.length > 0 && status !== 'loading' && !done

  // Once the answer is in place, the held files move on. This is an update during render, not in an
  // effect, so it happens once per batch: the next render finds nothing held.
  if (held.length > 0 && status !== 'loading' && done) {
    setReady({ files: held, add: addFiles })
    setHeld([])
  }

  // The files go in after the render that saved the answers, so the analysis reads the new values.
  useEffect(() => {
    if (ready !== null) ready.add(ready.files)
  }, [ready])

  const requestImport = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      if (workerStopped || (status !== 'loading' && done)) {
        addFiles(files)
        return
      }
      setHeld((current) => [...current, ...files])
    },
    [addFiles, done, status, workerStopped],
  )

  const finish = useCallback(
    async (patch: ProfilePatch) => {
      setSaving(true)
      setSaveError(null)
      try {
        await save({ ...patch, setupDone: true })
      } catch (failure) {
        setSaveError(messageOf(failure))
        setSaving(false)
        return
      }
      if (signedIn) {
        markDeviceSetupDone()
        setDeviceDone(true)
      }
      setSaving(false)
    },
    [save, signedIn],
  )

  return { open, held: held.length, saving, saveError, requestImport, finish }
}

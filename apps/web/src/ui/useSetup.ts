import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from './analysis/useLatest'
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
  /**
   * While the account loads, the answers kept on this device decide whether to ask. Files are never
   * held for the account itself.
   */
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
  /** How many files are waiting for the answers. */
  held: number
  /** Whether the answers are being stored. */
  saving: boolean
  /** Why the answers could not be stored. The files stay held until they are. */
  saveError: string | null
  /** Every import goes through here. Files wait, and the dialog opens, until setup is answered. */
  requestImport: (files: File[]) => void
  /** How many imports have been submitted, so a page can tell a new submission from an old one. */
  submitted: number
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
 *
 * The account is not waited for. Answers given while it loads are sent to the account afterwards,
 * if the visitor turns out to be signed in.
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
  // Until the account is known, the answers on this device are all there is to go on.
  const done =
    status === 'signed-in'
      ? deviceDone
      : status === 'loading'
        ? preferencesDone || deviceDone
        : preferencesDone
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Files waiting for the athlete's answer.
  const [held, setHeld] = useState<File[]>([])
  // Files whose answer is in place, handed to addFiles by the effect below.
  const [ready, setReady] = useState<Ready | null>(null)
  // Answers stored while the account loaded, waiting for it to be known.
  const answeredWhileLoading = useRef<ProfilePatch | null>(null)
  const latestSave = useLatest(save)
  const latestStatus = useLatest(status)
  const open = held.length > 0 && !done

  // Once the answer is in place, the held files move on. This is an update during render, not in an
  // effect, so it happens once per batch: the next render finds nothing held.
  if (held.length > 0 && done) {
    setReady({ files: held, add: addFiles })
    setHeld([])
  }

  // The files go in after the render that saved the answers, so the analysis reads the new values.
  useEffect(() => {
    if (ready !== null) ready.add(ready.files)
  }, [ready])

  /** Sends answers given while the account loaded to the account, now that it is signed in. */
  const sendToAccount = useCallback(
    (answers: ProfilePatch) => {
      // A refusal is kept as the save error, and the device is not marked done, so the questions are
      // asked again on the next import, with the reason shown.
      latestSave()(answers).then(
        () => {
          markDeviceSetupDone()
          setDeviceDone(true)
        },
        (failure: unknown) => setSaveError(messageOf(failure)),
      )
    },
    [latestSave],
  )

  // A visitor who turns out signed out keeps the answers in the preferences alone.
  useEffect(() => {
    if (status === 'loading' || answeredWhileLoading.current === null) return
    const answers = answeredWhileLoading.current
    answeredWhileLoading.current = null
    if (status === 'signed-in') sendToAccount(answers)
  }, [sendToAccount, status])

  const requestImport = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      setSubmitted((count) => count + 1)
      if (workerStopped || done) {
        addFiles(files)
        return
      }
      setHeld((current) => [...current, ...files])
    },
    [addFiles, done, workerStopped],
  )

  const finish = useCallback(
    async (patch: ProfilePatch) => {
      setSaving(true)
      setSaveError(null)
      const answers = { ...patch, setupDone: true }
      const answeredLoading = status === 'loading'
      try {
        await save(answers)
      } catch (failure) {
        setSaveError(messageOf(failure))
        setSaving(false)
        return
      }
      if (answeredLoading) {
        // The account may have settled while the answers were stored: then they go to it now.
        const now = latestStatus()
        if (now === 'loading') answeredWhileLoading.current = answers
        else if (now === 'signed-in') sendToAccount(answers)
      }
      if (signedIn) {
        markDeviceSetupDone()
        setDeviceDone(true)
      }
      setSaving(false)
    },
    [latestStatus, save, sendToAccount, signedIn, status],
  )

  return { open, held: held.length, saving, saveError, requestImport, finish, submitted }
}

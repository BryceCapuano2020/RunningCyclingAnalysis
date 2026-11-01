import { useCallback } from 'react'
import { uploadTitlesField } from '../uploadTitlesPreference'
import type { AthleteSettings, DigestSplits } from '@rca/core/types'
import {
  deleteNoticeText,
  EXPORT_INTERRUPTED,
  exportFailureText,
  LIBRARY_NOT_LOADED,
  LIBRARY_NOT_READY,
  SIGN_IN_TO_EXPORT,
  SPLITS_NOT_LOADED,
  STOPPED,
} from './copy'
import type { LibraryState } from './libraryState'
import { storedPeriodRequest } from '../periodPreference'
import { accountPending, drainBatches } from './model'
import type { Account, Box, SetError } from './model'
import type { SeenEvent } from '../../worker/protocol'
import type { WorkerTransport } from './workerTransport'

interface LibraryActionDeps {
  library: LibraryState
  transport: WorkerTransport
  refreshBusy: () => void
  accountRef: Box<Account>
  settingsRef: Box<AthleteSettings>
  setError: SetError
}

/** Loads, retries, holds, deletes and exports the signed-in library. */
export function useLibraryActions({
  library,
  transport,
  refreshBusy,
  accountRef,
  settingsRef,
  setError,
}: LibraryActionDeps) {
  const {
    libraryStatusRef,
    setLibrary,
    libraryWaitRef,
    savedActivitiesRef,
    setLibraryNotice,
    setLibraryError,
  } = library
  const { send, workerRef, restartWorker } = transport

  const loadLibrary = useCallback(
    (userId: string) => {
      setLibrary('loading')
      send({
        type: 'loadServer',
        settings: settingsRef.current,
        userId,
        ...uploadTitlesField(userId),
        ...storedPeriodRequest(),
      })
    },
    [send, setLibrary, settingsRef],
  )

  /** Imports wait for a loading library; otherwise there is no library for them to join. */
  const holdForLibrary = useCallback(
    (files: File[]) => {
      if (libraryStatusRef.current === 'loading') {
        libraryWaitRef.current.push(files)
        refreshBusy()
      } else {
        setError(LIBRARY_NOT_LOADED)
      }
    },
    [libraryStatusRef, libraryWaitRef, refreshBusy, setError],
  )

  /**
   * Marks the library failed. Imports held for it cannot run later, so they are dropped. Returns
   * whether any were dropped; the caller words that, so a worker-stopped message is not replaced.
   */
  const failLibrary = useCallback(() => {
    setLibrary('failed')
    const dropped = drainBatches(libraryWaitRef).length > 0
    refreshBusy()
    return dropped
  }, [libraryWaitRef, refreshBusy, setLibrary])

  const retryLibrary = useCallback(() => {
    const current = accountRef.current
    if (current.status !== 'signed-in' || current.me === null) return
    // With no worker, a restart re-reads the library as its account effect runs.
    if (workerRef.current === null) restartWorker()
    else loadLibrary(current.me.user.id)
  }, [accountRef, loadLibrary, restartWorker, workerRef])

  /** Sends what the outbox holds now, without reading the library again; answered once those saves have ended. */
  const resumeSaves = useCallback(() => {
    const current = accountRef.current
    if (current.status !== 'signed-in' || current.me === null || workerRef.current === null) return
    send({ type: 'resumeSaves', settings: settingsRef.current, userId: current.me.user.id })
  }, [accountRef, send, settingsRef, workerRef])

  const deleteActivity = useCallback(
    (id: string) => {
      const current = accountRef.current
      const signedIn = current.status === 'signed-in'
      // Signed out, the library is the one kept in this browser; signed in, it must have loaded. Until
      // then the delete says why nothing happened, rather than closing without a word.
      if (
        accountPending(current) ||
        (signedIn && (current.me === null || libraryStatusRef.current !== 'loaded'))
      ) {
        setLibraryError(LIBRARY_NOT_READY)
        return
      }
      if (workerRef.current === null) {
        setLibraryError(STOPPED)
        return
      }
      const activity = savedActivitiesRef.current.find((saved) => saved.id === id)
      setLibraryNotice(null)
      setLibraryError(null)
      const settings = settingsRef.current
      send(
        signedIn && current.me !== null
          ? { type: 'deleteActivity', id, userId: current.me.user.id, settings }
          : { type: 'deleteDeviceActivity', id, settings },
        deleteNoticeText(activity),
      )
    },
    [
      accountRef,
      libraryStatusRef,
      savedActivitiesRef,
      send,
      setLibraryError,
      setLibraryNotice,
      settingsRef,
      workerRef,
    ],
  )

  /**
   * The signed-in account's data as a JSON file, built from the server by the worker. Rejects with
   * the reason when it cannot be made. An export does not make the page busy.
   */
  const exportData = useCallback(
    () =>
      new Promise<Blob>((resolve, reject) => {
        const current = accountRef.current
        const signedIn = current.status === 'signed-in' ? current.me : null
        if (signedIn === null) {
          reject(new Error(SIGN_IN_TO_EXPORT))
          return
        }
        if (workerRef.current === null) {
          reject(new Error(EXPORT_INTERRUPTED))
          return
        }
        send(
          {
            type: 'exportData',
            userId: signedIn.user.id,
            account: { name: signedIn.user.name, email: signedIn.user.email },
            profile: signedIn.profile,
            measurements: [...(settingsRef.current.measurements ?? [])],
          },
          undefined,
          (message) => {
            if (message?.type === 'exportReady') resolve(message.file)
            else if (message?.type === 'error') reject(new Error(exportFailureText(message)))
            else reject(new Error(EXPORT_INTERRUPTED))
          },
        )
      }),
    [accountRef, send, settingsRef, workerRef],
  )

  /**
   * The run splits of one held activity. Resolves with null when the activity has none. Rejects
   * when the worker cannot answer, so the page can say the splits did not load.
   */
  const activitySplits = useCallback(
    (id: string) =>
      new Promise<DigestSplits | null>((resolve, reject) => {
        if (workerRef.current === null) {
          reject(new Error(SPLITS_NOT_LOADED))
          return
        }
        send({ type: 'activitySplits', id }, undefined, (message) => {
          if (message?.type === 'splits') resolve(message.splits)
          else reject(new Error(SPLITS_NOT_LOADED))
        })
      }),
    [send, workerRef],
  )

  /** The athlete opened, hid or was shown the check-in row; the worker keeps it and says whether it is now seen. */
  const markCheckInSeen = useCallback(
    (event: SeenEvent) => {
      if (workerRef.current === null) return
      send({ type: 'markSeen', row: 'checkIn', event }, undefined, (message) => {
        if (message?.type === 'checkInSaved') {
          library.setCheckIn((previous) => ({ ...previous, seen: message.seen }))
        }
      })
    },
    [library, send, workerRef],
  )

  /** The same for "Your years": the worker keeps it and says whether the row is now seen. */
  const markLookBackSeen = useCallback(
    (event: SeenEvent) => {
      if (workerRef.current === null) return
      send({ type: 'markSeen', row: 'lookBack', event }, undefined, (message) => {
        if (message?.type === 'checkInSaved') {
          library.setCheckIn((previous) => ({ ...previous, lookBackSeen: message.seen }))
        }
      })
    },
    [library, send, workerRef],
  )

  /** The athlete goes on with an import that stopped short: the worker moves the baseline now. */
  const acceptPartialImport = useCallback(() => {
    if (workerRef.current !== null) send({ type: 'acceptPartialImport' })
  }, [send, workerRef])

  return {
    markCheckInSeen,
    markLookBackSeen,
    acceptPartialImport,
    loadLibrary,
    holdForLibrary,
    failLibrary,
    retryLibrary,
    resumeSaves,
    deleteActivity,
    exportData,
    activitySplits,
  }
}

export type LibraryActions = ReturnType<typeof useLibraryActions>

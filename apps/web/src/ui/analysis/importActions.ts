import { useCallback } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import {
  ACCOUNT_CHANGED_BEFORE_IMPORT,
  INTERRUPTED,
  ORIGINALS_UNAVAILABLE,
  PROFILE_NOT_CONFIRMED,
  SAMPLE_BLOCKED,
} from './copy'
import type { ImportState } from './importState'
import type { LibraryActions } from './libraryActions'
import type { LibraryState } from './libraryState'
import type { Account, Box, ErrorNotice, SetError, Setter } from './model'
import type { WorkerTransport } from './workerTransport'

interface ImportActionDeps {
  imports: ImportState
  library: LibraryState
  transport: WorkerTransport
  refreshBusy: () => void
  libraryActions: LibraryActions
  accountRef: Box<Account>
  accountEpochRef: Box<number>
  settingsRef: Box<AthleteSettings>
  setError: SetError
  setErrorNotice: Setter<ErrorNotice | null>
}

/** Adds files, loads the sample, sets the range, rebuilds saved activities, and clears the session. */
export function useImportActions({
  imports,
  library,
  transport,
  refreshBusy,
  libraryActions,
  accountRef,
  accountEpochRef,
  settingsRef,
  setError,
  setErrorNotice,
}: ImportActionDeps) {
  const { setRebuildNotice, pendingAsyncImportsRef, deferredImportsRef } = imports
  const { libraryStatusRef } = library
  const { workerGenerationRef, send } = transport
  const { holdForLibrary } = libraryActions

  /**
   * Saves a signed-in import once the profile writes it depends on have landed. The async work
   * checks the worker generation and account epoch again, so an answer from a changed account or a
   * stopped worker is dropped.
   */
  const queueSignedInImport = useCallback(
    (files: File[], submittedUserId: string) => {
      const generation = workerGenerationRef.current
      const accountEpoch = accountEpochRef.current
      const submittedAccount = accountRef.current
      const flushProfileWrites = submittedAccount.flushProfileWrites
      pendingAsyncImportsRef.current += 1
      refreshBusy()

      void (async () => {
        try {
          // The returned Me is updated synchronously by useAccount when the last queued profile
          // write succeeds, even before React commits the corresponding render.
          const savedMe = flushProfileWrites ? await flushProfileWrites() : submittedAccount.me
          const current = accountRef.current
          if (workerGenerationRef.current !== generation) {
            if (accountEpochRef.current !== accountEpoch) {
              if (current.status !== 'loading') setError(ACCOUNT_CHANGED_BEFORE_IMPORT)
            } else {
              // Keep a message that is already shown, such as a stop, rather than replacing it.
              setErrorNotice((notice) => notice ?? { message: INTERRUPTED, issue: null })
            }
            return
          }
          if (
            accountEpochRef.current !== accountEpoch ||
            current.status !== 'signed-in' ||
            savedMe?.user.id !== submittedUserId
          ) {
            setError(ACCOUNT_CHANGED_BEFORE_IMPORT)
            return
          }
          if (libraryStatusRef.current !== 'loaded') {
            holdForLibrary(files)
            return
          }
          send({
            type: 'addFiles',
            files,
            settings: {
              massKg: savedMe.profile.massKg,
              bikeMassKg: savedMe.profile.bikeMassKg,
            },
            sync: {
              keepFiles: savedMe.profile.keepFiles && savedMe.fileRetentionAvailable !== false,
              userId: submittedUserId,
            },
          })
        } catch {
          if (
            workerGenerationRef.current === generation &&
            accountEpochRef.current === accountEpoch
          ) {
            setError(PROFILE_NOT_CONFIRMED)
          }
        } finally {
          pendingAsyncImportsRef.current = Math.max(0, pendingAsyncImportsRef.current - 1)
          refreshBusy()
        }
      })()
    },
    [
      accountEpochRef,
      accountRef,
      holdForLibrary,
      libraryStatusRef,
      pendingAsyncImportsRef,
      refreshBusy,
      send,
      setError,
      setErrorNotice,
      workerGenerationRef,
    ],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      // File objects are cloned by reference, so the worker streams them without a copy here.
      if (files.length === 0) return
      const current = accountRef.current
      if (current.status === 'loading') {
        deferredImportsRef.current.push(files)
        refreshBusy()
        return
      }
      if (current.status === 'signed-in' && current.me !== null) {
        if (libraryStatusRef.current === 'loaded') queueSignedInImport(files, current.me.user.id)
        else holdForLibrary(files)
        return
      }
      send({ type: 'addFiles', files, settings: settingsRef.current, sync: null })
    },
    [
      accountRef,
      deferredImportsRef,
      holdForLibrary,
      libraryStatusRef,
      queueSignedInImport,
      refreshBusy,
      send,
      settingsRef,
    ],
  )

  const loadSample = useCallback(() => {
    if (accountRef.current.status === 'signed-in') {
      setError(SAMPLE_BLOCKED)
      return
    }
    send({ type: 'loadSample', settings: settingsRef.current })
  }, [accountRef, send, setError, settingsRef])

  const setRange = useCallback(
    (rangeDays: number | null) =>
      send({ type: 'setRange', rangeDays, settings: settingsRef.current }),
    [send, settingsRef],
  )

  const clear = useCallback(() => send({ type: 'clear' }), [send])

  const rebuildSavedActivities = useCallback(() => {
    setRebuildNotice(null)
    const current = accountRef.current
    const userId = current.status === 'signed-in' ? current.me?.user.id : undefined
    if (userId === undefined || current.me === null) return
    if (current.me.fileRetentionAvailable === false) {
      setRebuildNotice(ORIGINALS_UNAVAILABLE)
      return
    }
    send({ type: 'rebuildStale', settings: settingsRef.current, userId })
  }, [accountRef, send, setRebuildNotice, settingsRef])

  return { addFiles, loadSample, setRange, clear, rebuildSavedActivities }
}

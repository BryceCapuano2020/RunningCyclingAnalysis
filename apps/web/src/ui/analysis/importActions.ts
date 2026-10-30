import { useCallback } from 'react'
import { bodyMassOn } from '@rca/core/athlete'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { PeriodChoice } from '@rca/core/period'
import type { AthleteSettings } from '@rca/core/types'
import { forgetSeenNotes } from '../aboutDataStore'
import { clearKeptPower } from '../keptPowerStore'
import { withWeights } from '../athlete'
import { storedPeriodRequest } from '../periodPreference'
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
import { accountPending, drainBatches, EMPTY_SESSION } from './model'
import type { Account, Box, ErrorNotice, SetError, Setter } from './model'
import type { WorkerTransport } from './workerTransport'
import type { WorkerResponse } from '../../worker/protocol'

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
  /** The result the worker last reported, for an import that does not say which one it is compared with. */
  latestBaseline: () => AnalysisResult | null
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
  latestBaseline,
}: ImportActionDeps) {
  const { setRebuildNotice, pendingAsyncImportsRef, provisionalImportsRef, reportedRef } = imports
  const { libraryStatusRef, libraryWaitRef, setRestoring } = library
  // Counts each Start over (in the transport), so an import made before one is not sent after it.
  const { workerGenerationRef, send, sessionEpochRef } = transport
  const { holdForLibrary } = libraryActions

  /**
   * Saves a signed-in import once the profile writes it depends on have landed. The async work
   * checks the worker generation and account epoch again, so an answer from a changed account or a
   * stopped worker is dropped.
   */
  const queueSignedInImport = useCallback(
    (files: File[], submittedUserId: string, baseline?: AnalysisResult | null) => {
      const generation = workerGenerationRef.current
      const accountEpoch = accountEpochRef.current
      const submittedAccount = accountRef.current
      const flushProfileWrites = submittedAccount.flushProfileWrites
      const session = sessionEpochRef.current
      pendingAsyncImportsRef.current += 1
      refreshBusy()

      void (async () => {
        try {
          // The returned Me is updated synchronously by useAccount when the last queued profile
          // write succeeds, even before React commits the corresponding render.
          const savedMe = flushProfileWrites ? await flushProfileWrites() : submittedAccount.me
          const current = accountRef.current
          // A Start over since the import was made abandons it, so nothing is saved after it.
          if (sessionEpochRef.current !== session) return
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
          send(
            {
              type: 'addFiles',
              files,
              settings: withWeights(settingsRef.current, {
                // Today's weight by the one rule, so an import is priced as the page is: a dated weight in effect today
                // wins over the profile's, which a date passing leaves behind.
                massKg: bodyMassOn(
                  savedMe.profile.massKg,
                  settingsRef.current.measurements ?? [],
                  Date.now(),
                ),
                bikeMassKg: savedMe.profile.bikeMassKg,
              }),
              sync: {
                keepFiles: savedMe.profile.keepFiles && savedMe.fileRetentionAvailable !== false,
                userId: submittedUserId,
              },
            },
            undefined,
            undefined,
            // Read when the import is sent, after the profile writes it waited for, unless it was
            // released from a library wait with the baseline that wait gave it.
            baseline === undefined ? latestBaseline() : baseline,
          )
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
      latestBaseline,
      libraryStatusRef,
      pendingAsyncImportsRef,
      refreshBusy,
      send,
      sessionEpochRef,
      setError,
      setErrorNotice,
      settingsRef,
      workerGenerationRef,
    ],
  )

  // An import is compared with the result the worker last reported when it is sent to the worker. The
  // page shows that result once it renders. Files released from a library wait are given the baseline
  // that wait gave them, and keep it; every other import reads the baseline when it is sent.
  const addFiles = useCallback(
    (files: File[], baseline?: AnalysisResult | null) => {
      // File objects are cloned by reference, so the worker streams them without a copy here.
      if (files.length === 0) return
      const current = accountRef.current
      if (accountPending(current)) {
        // Analysed now, in this session only. Nothing is kept until the account is known, so a signed-in
        // visitor's files never reach this device. Once it is known, the files are sent again. A refused
        // request is not kept, since nothing would send it again.
        const sent = send({
          type: 'addFiles',
          files,
          settings: settingsRef.current,
          sync: null,
          provisional: true,
        })
        if (sent) provisionalImportsRef.current.push(files)
        return
      }
      if (current.status === 'signed-in' && current.me !== null) {
        if (libraryStatusRef.current === 'loaded') {
          queueSignedInImport(files, current.me.user.id, baseline)
        } else {
          holdForLibrary(files)
        }
        return
      }
      // Signed out, the digests are kept in this browser so the results survive a reload.
      send(
        {
          type: 'addFiles',
          files,
          settings: settingsRef.current,
          sync: null,
          saveToDevice: true,
        },
        undefined,
        undefined,
        baseline === undefined ? latestBaseline() : baseline,
      )
    },
    [
      accountRef,
      holdForLibrary,
      latestBaseline,
      libraryStatusRef,
      provisionalImportsRef,
      queueSignedInImport,
      send,
      settingsRef,
    ],
  )

  const loadSample = useCallback(() => {
    if (accountRef.current.status === 'signed-in') {
      setError(SAMPLE_BLOCKED)
      return
    }
    send({ type: 'loadSample', settings: settingsRef.current, ...storedPeriodRequest() })
  }, [accountRef, send, setError, settingsRef])

  // The requested period is kept as soon as it is chosen, so a clear that follows can send it again
  // before the worker has answered.
  // The answer, when given, is called once with the worker's reply to this pick, or with null when the
  // pick is dropped before a reply.
  const setRange = useCallback(
    (choice: PeriodChoice, answered?: (reply: WorkerResponse | null) => void) =>
      send(
        { type: 'setRange', choice, settings: settingsRef.current },
        undefined,
        answered ? (reply) => answered(reply) : undefined,
      ),
    [send, settingsRef],
  )

  // Signed out, starting over also forgets the activities kept in this browser. Files analysed while
  // the account loaded are not sent again once it is known.
  // Imports waiting for a library that has not loaded yet are dropped too, so none is saved after this.
  const clear = useCallback(() => {
    sessionEpochRef.current += 1
    // A library read still owed by the worker is overtaken, so the restoring state ends now.
    setRestoring(false)
    drainBatches(provisionalImportsRef)
    drainBatches(libraryWaitRef)
    transport.dropProvisional()
    // What was cleared is no baseline, even before the worker answers the clear.
    reportedRef.current = EMPTY_SESSION
    forgetSeenNotes()
    clearKeptPower()
    send({ type: 'clear', forgetDevice: accountRef.current.status !== 'signed-in' })
    refreshBusy()
  }, [
    accountRef,
    libraryWaitRef,
    provisionalImportsRef,
    refreshBusy,
    reportedRef,
    send,
    sessionEpochRef,
    setRestoring,
    transport,
  ])

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

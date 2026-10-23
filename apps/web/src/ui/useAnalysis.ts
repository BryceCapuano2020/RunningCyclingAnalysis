import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { ImportOutcome, SavedActivity, WorkerRequest } from '../worker/protocol'
import { useAccountIssue, useAccountTransitions } from './analysis/accountSync'
import { WAITING_FOR_LIBRARY } from './analysis/copy'
import { useImportActions } from './analysis/importActions'
import { useImportState } from './analysis/importState'
import { useLibraryActions } from './analysis/libraryActions'
import { useLibraryState } from './analysis/libraryState'
import type { Account, ErrorNotice, LibraryStatus, Pending } from './analysis/model'
import { EMPTY_SESSION } from './analysis/model'
import { useWorkerEvents } from './analysis/workerEvents'
import { useWorkerTransport } from './analysis/workerTransport'
import type { AccountStatus } from './useAccount'

export type { LibraryStatus }

export interface AnalysisController {
  state: SessionState
  /** Import work is in progress or waiting. A library change such as a delete is not counted. */
  busy: boolean
  /** Why held imports are waiting, or null when nothing is waiting. */
  waitingReason: string | null
  /** Number of activity files read so far during an import. */
  progress: number | null
  /** Number of files uploaded so far during an import that keeps files, otherwise null. */
  uploading: number | null
  error: string | null
  /** The worker's reason for `error`, when the page words that error specially. */
  errorIssue: SyncIssueCode | null
  workerStopped: boolean
  stop: () => void
  retryWorker: () => void
  libraryStatus: LibraryStatus
  /** Reads the signed-in library again. Imports are not held for a failed load; they must be added again. */
  retryLibrary: () => void
  /** Saved activities whose original file is not in the library. */
  missingOriginals: number
  /** Stored activities the server could not read in the last library load, and so are hidden. */
  libraryUnreadable: number
  importOutcome: ImportOutcome | null
  savedActivities: SavedActivity[]
  /** A library change in progress. It does not make the import dropzone busy. */
  libraryAction: 'deleting' | null
  /** Confirms the last library change. */
  libraryNotice: string | null
  /** Says why the last library change failed. */
  libraryError: string | null
  deleteActivity: (id: string) => void
  /**
   * The signed-in account's data as a JSON file, built from the server by the worker. Rejects with
   * the reason when it cannot be made. An export does not make the page busy.
   */
  exportData: () => Promise<Blob>
  rebuildNotice: string | null
  rebuildSavedActivities: () => void
  addFiles: (files: File[]) => void
  loadSample: () => void
  setRange: (rangeDays: number | null) => void
  clear: () => void
}

/**
 * Runs the analysis in a worker. While signed in, the account's stored activities are loaded when
 * sign-in completes, and imports are saved to the account once that library has loaded. Signing
 * out clears the library.
 *
 * The pieces are in ./analysis. This hook wires them together, and owns the two things that touch
 * every piece: what is busy (refreshBusy) and the one place that empties the queues (clearQueues).
 * Hook order is the effect order: the worker effect runs before the settings effect, and both run
 * before the account effect, so a new worker exists before the account pass sends its first request.
 */
export function useAnalysis(settings: AthleteSettings, account: Account): AnalysisController {
  const settingsRef = useRef(settings)
  const accountRef = useRef<Account>(account)
  const accountEpochRef = useRef(0)
  // Starts as 'loading' so an account that is already known on mount counts as a sign-in.
  const previousStatusRef = useRef<AccountStatus>('loading')
  const previousUserIdRef = useRef<string | null>(null)
  // Created here, not in the transport, because refreshBusy reads it and the transport needs refreshBusy.
  const pendingRepliesRef = useRef<Pending[]>([])
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null)

  const setError = useCallback((message: string | null, issue: SyncIssueCode | null = null) => {
    setErrorNotice(message === null ? null : { message, issue })
  }, [])
  const error = errorNotice?.message ?? null
  const errorIssue = errorNotice?.issue ?? null

  // Keep the latest committed account available to async import preparation without waiting for
  // the account-transition effect to run.
  useLayoutEffect(() => {
    accountRef.current = account
  }, [account])

  const library = useLibraryState()
  const imports = useImportState()
  const {
    setLibraryAction,
    setLibraryNotice,
    setLibraryError,
    setLibraryUnreadable,
    libraryWaitRef,
  } = library
  const {
    setBusy,
    setWaitingReason,
    pendingAsyncImportsRef,
    deferredImportsRef,
    setState,
    setProgress,
    setUploading,
    setRebuildNotice,
  } = imports

  /** Recomputes what the page shows as busy, waiting, and in a library change. */
  const refreshBusy = useCallback(() => {
    const replies = pendingRepliesRef.current
    setLibraryAction(
      replies.some((pending) => pending.kind === 'deleteActivity') ? 'deleting' : null,
    )
    setBusy(
      replies.some(
        (pending) => pending.kind !== 'deleteActivity' && pending.kind !== 'exportData',
      ) ||
        pendingAsyncImportsRef.current > 0 ||
        deferredImportsRef.current.length > 0 ||
        libraryWaitRef.current.length > 0,
    )
    setWaitingReason(
      libraryWaitRef.current.length > 0 || deferredImportsRef.current.length > 0
        ? WAITING_FOR_LIBRARY
        : null,
    )
  }, [
    deferredImportsRef,
    libraryWaitRef,
    pendingAsyncImportsRef,
    setBusy,
    setLibraryAction,
    setWaitingReason,
  ])

  /** The notices a request replaces are cleared as it is sent. */
  const onSend = useCallback(
    (request: WorkerRequest) => {
      refreshBusy()
      // A download does not touch the import or library error, so it is not cleared here.
      if (request.type !== 'loadServer' && request.type !== 'exportData') setError(null)
      // A new import or rebuild replaces the outcome of the last library change.
      if (request.type === 'addFiles' || request.type === 'rebuildStale') {
        setLibraryNotice(null)
        setLibraryError(null)
      }
      // A library load or rebuild reports the unreadable count afresh, so an old one is cleared.
      if (request.type === 'loadServer' || request.type === 'rebuildStale') {
        setLibraryUnreadable(0)
      }
    },
    [refreshBusy, setError, setLibraryError, setLibraryNotice, setLibraryUnreadable],
  )

  const transport = useWorkerTransport({ pendingRepliesRef, onSend, setError })
  const { dropPendingReplies, unsentRef, restartWorker, setWorkerStopped } = transport
  const { automaticRestartCountRef } = transport

  const libraryActions = useLibraryActions({
    library,
    transport,
    refreshBusy,
    accountRef,
    settingsRef,
    setError,
  })
  const importActions = useImportActions({
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
  })
  const handleAccountIssue = useAccountIssue({
    accountRef,
    loadLibrary: libraryActions.loadLibrary,
  })

  /**
   * Empties every queue: the requests waiting for a worker, the requests the worker still owes, and
   * the imports waiting for the account or the library. Both the stop and an account change use it.
   */
  const clearQueues = useCallback(() => {
    dropPendingReplies()
    unsentRef.current = []
    deferredImportsRef.current = []
    libraryWaitRef.current = []
    refreshBusy()
  }, [deferredImportsRef, dropPendingReplies, libraryWaitRef, refreshBusy, unsentRef])

  const stop = useCallback(() => {
    clearQueues()
    setProgress(null)
    setUploading(null)
    setState(EMPTY_SESSION)
    setRebuildNotice(null)
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(
      accountRef.current.status === 'signed-in'
        ? 'Analysis stopped. Saved activities are reloading; re-import any local files that were not saved.'
        : 'Analysis stopped. Re-import your files to continue.',
    )
    restartWorker()
  }, [
    accountRef,
    automaticRestartCountRef,
    clearQueues,
    restartWorker,
    setError,
    setProgress,
    setRebuildNotice,
    setState,
    setUploading,
    setWorkerStopped,
  ])

  useWorkerEvents({
    transport,
    imports,
    library,
    setError,
    refreshBusy,
    failLibrary: libraryActions.failLibrary,
    addFiles: importActions.addFiles,
    handleAccountIssue,
    accountRef,
    previousStatusRef,
    previousUserIdRef,
  })

  const { massKg, bikeMassKg } = settings
  const { send } = transport
  useEffect(() => {
    const changed =
      settingsRef.current.massKg !== massKg || settingsRef.current.bikeMassKg !== bikeMassKg
    settingsRef.current = { massKg, bikeMassKg }
    if (changed) send({ type: 'setSettings', settings: settingsRef.current })
  }, [massKg, bikeMassKg, send])

  useAccountTransitions({
    account,
    accountEpochRef,
    previousStatusRef,
    previousUserIdRef,
    transport,
    imports,
    library,
    setError,
    addFiles: importActions.addFiles,
    loadLibrary: libraryActions.loadLibrary,
    clearQueues,
  })

  return {
    state: imports.state,
    busy: imports.busy,
    waitingReason: imports.waitingReason,
    progress: imports.progress,
    uploading: imports.uploading,
    error,
    errorIssue,
    workerStopped: transport.workerStopped,
    stop,
    retryWorker: transport.retryWorker,
    libraryStatus: library.libraryStatus,
    retryLibrary: libraryActions.retryLibrary,
    missingOriginals: library.missingOriginals,
    libraryUnreadable: library.libraryUnreadable,
    importOutcome: imports.importOutcome,
    savedActivities: library.savedActivities,
    libraryAction: library.libraryAction,
    libraryNotice: library.libraryNotice,
    libraryError: library.libraryError,
    deleteActivity: libraryActions.deleteActivity,
    exportData: libraryActions.exportData,
    rebuildNotice: imports.rebuildNotice,
    rebuildSavedActivities: importActions.rebuildSavedActivities,
    addFiles: importActions.addFiles,
    loadSample: importActions.loadSample,
    setRange: importActions.setRange,
    clear: importActions.clear,
  }
}

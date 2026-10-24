import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { ImportOutcome, SavedActivity, WorkerRequest } from '../worker/protocol'
import { useAccountIssue, useAccountTransitions } from './analysis/accountSync'
import { STOPPED_KEPT_RESULTS, WAITING_FOR_LIBRARY } from './analysis/copy'
import { useImportActions } from './analysis/importActions'
import type { ImportChange } from './analysis/importState'
import { baselineOf, useImportState } from './analysis/importState'
import { useLibraryActions } from './analysis/libraryActions'
import { useLibraryState } from './analysis/libraryState'
import type { Account, ErrorNotice, ImportProgress, LibraryStatus, Pending } from './analysis/model'
import { EMPTY_SESSION, isDeletion } from './analysis/model'
import { useLatest } from './analysis/useLatest'
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
  /** Activity files read so far during an import, with the total when it is known. */
  progress: ImportProgress | null
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
  /** What the last import moved from, while its summary is shown; null otherwise. */
  importChange: ImportChange | null
  /** The summary was dismissed, so what moved goes with it. */
  dismissSummary: () => void
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
 * sign-in completes, and imports are saved to the account once that library has loaded. Signed
 * out, the library kept in this browser is loaded and imports are kept there.
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
  // The analysis on screen when the last import was sent: what its summary compares with.
  const baselineRef = useRef<AnalysisResult | null>(null)

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
  const latestState = useLatest(imports.state)
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
    setImportOutcome,
    setImportChange,
  } = imports

  /** Recomputes what the page shows as busy, waiting, and in a library change. */
  const refreshBusy = useCallback(() => {
    const replies = pendingRepliesRef.current
    setLibraryAction(replies.some((pending) => isDeletion(pending.kind)) ? 'deleting' : null)
    // Reading the library kept in this browser is quick and queued before anything else, so it
    // does not hold the page busy: the sample and imports stay available while it loads.
    const quiet = (kind: Pending['kind']) =>
      isDeletion(kind) || kind === 'exportData' || kind === 'loadDevice'
    setBusy(
      replies.some((pending) => !quiet(pending.kind)) ||
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
      // Library loads run when a worker starts, including after a crash, so they keep the message
      // that says why; a download does not touch the import or library error either.
      const keepsError =
        request.type === 'loadServer' ||
        request.type === 'loadDevice' ||
        request.type === 'exportData'
      if (!keepsError) setError(null)
      // Taken as the import is sent. An import sent before the one before it replies compares with
      // the same result, since that reply has not yet changed what is on screen.
      if (request.type === 'addFiles') baselineRef.current = baselineOf(latestState())
      // A new import or rebuild replaces the outcome of the last library change.
      if (request.type === 'addFiles' || request.type === 'rebuildStale') {
        setLibraryNotice(null)
        setLibraryError(null)
      }
      // A library load or rebuild reports the unreadable count afresh, so an old one is cleared.
      if (request.type === 'loadServer' || request.type === 'rebuildStale') {
        setLibraryUnreadable(0)
      }
      // The summary describes the last import only, so it goes once another import, a clear or the sample is sent.
      if (
        request.type === 'addFiles' ||
        request.type === 'clear' ||
        request.type === 'loadSample'
      ) {
        setImportOutcome(null)
      }
    },
    [
      latestState,
      refreshBusy,
      setError,
      setImportOutcome,
      setLibraryError,
      setLibraryNotice,
      setLibraryUnreadable,
    ],
  )

  const transport = useWorkerTransport({ pendingRepliesRef, onSend, setError })
  const { dropPendingReplies, unsentRef, restartWorker, setWorkerStopped } = transport
  const { automaticRestartCountRef, send: sendToWorker } = transport

  // Signed out, each worker starts from the library kept in this browser, once. While the account
  // is still loading it waits, so a signed-in account's page never shows the device library.
  const deviceLoadedRef = useRef(false)
  const loadDeviceOnce = useCallback(() => {
    const { status } = accountRef.current
    if (deviceLoadedRef.current || (status !== 'signed-out' && status !== 'unavailable')) return
    deviceLoadedRef.current = true
    sendToWorker({ type: 'loadDevice', settings: settingsRef.current })
  }, [sendToWorker])

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

  /**
   * The summary was dismissed, so what moved goes with it. The baseline stays: an import still
   * waiting for its reply compares with it, and the next import replaces it.
   */
  const dismissSummary = useCallback(() => setImportChange(null), [setImportChange])

  const stop = useCallback(() => {
    clearQueues()
    setProgress(null)
    setUploading(null)
    setState(EMPTY_SESSION)
    setImportOutcome(null)
    setRebuildNotice(null)
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(
      accountRef.current.status === 'signed-in'
        ? 'Analysis stopped. Saved activities are reloading; re-import any local files that were not saved.'
        : STOPPED_KEPT_RESULTS,
    )
    restartWorker()
  }, [
    accountRef,
    automaticRestartCountRef,
    clearQueues,
    restartWorker,
    setError,
    setImportOutcome,
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
    deviceLoadedRef,
    loadDeviceOnce,
    baselineRef,
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
    loadDeviceOnce,
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
    // The change belongs to the outcome on screen; a cleared or replaced summary drops it.
    importChange:
      imports.importChange?.outcome === imports.importOutcome ? imports.importChange : null,
    dismissSummary,
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

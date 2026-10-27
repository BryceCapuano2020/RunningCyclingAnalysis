import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PeriodChoice, SessionState, SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings, DigestSplits } from '@rca/core/types'
import type {
  ImportOutcome,
  SavedActivity,
  WorkerRequest,
  WorkerResponse,
} from '../worker/protocol'
import { useAccountIssue, useAccountTransitions } from './analysis/accountSync'
import { SAVES_PAUSED, STOPPED_BY_USER, WAITING_FOR_LIBRARY } from './analysis/copy'
import { useImportActions } from './analysis/importActions'
import { isQuietRequest } from './analysis/quietRequests'
import type { ImportChange } from './analysis/importState'
import { baselineOf, useImportState } from './analysis/importState'
import { useLibraryActions } from './analysis/libraryActions'
import { useLibraryState } from './analysis/libraryState'
import type { Account, ErrorNotice, ImportProgress, LibraryStatus, Pending } from './analysis/model'
import { drainBatches, isDeletion } from './analysis/model'
import { useWorkerEvents } from './analysis/workerEvents'
import { useWorkerTransport } from './analysis/workerTransport'
import { storedPeriodRequest } from './periodPreference'
import { replyOf } from './routeReply'
import type { RouteReply } from './routeReply'
import type { AccountStatus } from './useAccount'
import { useGradeTrendRequest } from './analysis/useGradeTrendRequest'

export type { LibraryStatus }

export interface AnalysisController {
  state: SessionState
  /** Import work is in progress or waiting. A library change such as a delete is not counted. */
  busy: boolean
  /** Why an import is held or paused, or null when nothing is waiting. */
  waitingReason: string | null
  /** Activity files read so far during an import, with the total when it is known. */
  progress: ImportProgress | null
  /** Number of files uploaded so far during an import that keeps files, otherwise null. */
  uploading: number | null
  /** The activities the last signed-in import saved, as its reply counted them. Null until one ends. */
  savedCount: number | null
  error: string | null
  /** The worker's reason for `error`, when the page words that error specially. */
  errorIssue: SyncIssueCode | null
  /** `error` is news the visitor asked for, such as a stop, rather than a fault. */
  errorNeutral: boolean
  workerStopped: boolean
  stop: () => void
  retryWorker: () => void
  libraryStatus: LibraryStatus
  /** A reload of a visit that kept results, before the library they kept has been read. */
  restoring: boolean
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
  /** The run splits of one held activity; null when it has none. Does not make the page busy. */
  activitySplits: (id: string) => Promise<DigestSplits | null>
  rebuildNotice: string | null
  rebuildSavedActivities: () => void
  addFiles: (files: File[]) => void
  loadSample: () => void
  setRange: (choice: PeriodChoice, answered?: (reply: WorkerResponse | null) => void) => void
  clear: () => void
  /**
   * The route of a saved activity, by its library id. `fromOriginal` reads the kept original file,
   * which is done only when the visitor asks. A read never shows an error or makes the page busy.
   */
  loadRoute: (id: string, fromOriginal: boolean) => Promise<RouteReply>
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
export function useAnalysis(
  settings: AthleteSettings,
  account: Account,
  gradeTrend: boolean,
): AnalysisController {
  const settingsRef = useRef(settings)
  const accountRef = useRef<Account>(account)
  const accountEpochRef = useRef(0)
  // Starts as 'loading' so an account that is already known on mount counts as a sign-in.
  const previousStatusRef = useRef<AccountStatus>('loading')
  const previousUserIdRef = useRef<string | null>(null)
  // Created here, not in the transport, because refreshBusy reads it and the transport needs refreshBusy.
  const pendingRepliesRef = useRef<Pending[]>([])
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null)

  const setError = useCallback(
    (message: string | null, issue: SyncIssueCode | null = null, neutral = false) => {
      setErrorNotice(message === null ? null : { message, issue, neutral })
    },
    [],
  )
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
    provisionalImportsRef,
    setProgress,
    setUploading,
    setRebuildNotice,
    setImportOutcome,
    setImportChange,
    reportedRef,
  } = imports

  /** Recomputes what the page shows as busy, waiting, and in a library change. */
  const refreshBusy = useCallback(() => {
    const replies = pendingRepliesRef.current
    setLibraryAction(replies.some((pending) => isDeletion(pending.kind)) ? 'deleting' : null)
    setBusy(
      replies.some((pending) => !isQuietRequest(pending.kind)) ||
        pendingAsyncImportsRef.current > 0 ||
        libraryWaitRef.current.length > 0,
    )
    setWaitingReason(libraryWaitRef.current.length > 0 ? WAITING_FOR_LIBRARY : null)
  }, [libraryWaitRef, pendingAsyncImportsRef, setBusy, setLibraryAction, setWaitingReason])

  /** The notices a request replaces are cleared as it is sent. */
  const onSend = useCallback(
    (request: WorkerRequest) => {
      refreshBusy()
      // Library loads run when a worker starts, including after a crash, so they keep the message
      // that says why; a download does not touch the import or library error either.
      const keepsError =
        request.type === 'loadServer' ||
        request.type === 'loadDevice' ||
        request.type === 'exportData' ||
        request.type === 'activitySplits' ||
        request.type === 'routeShape' ||
        request.type === 'forgetRoutes'
      if (!keepsError) setError(null)
      // A new import or rebuild replaces the outcome of the last library change.
      if (request.type === 'addFiles' || request.type === 'rebuildStale') {
        setLibraryNotice(null)
        setLibraryError(null)
      }
      // A library load or rebuild reports the unreadable count afresh, so an old one is cleared.
      if (request.type === 'loadServer' || request.type === 'rebuildStale') {
        setLibraryUnreadable(0)
      }
      // The summary describes the last import only: another import, a clear, the sample or a delete
      // replaces it, since a delete changes the count the summary gave.
      if (
        request.type === 'addFiles' ||
        request.type === 'clear' ||
        request.type === 'loadSample' ||
        request.type === 'deleteActivity' ||
        request.type === 'deleteDeviceActivity'
      ) {
        setImportOutcome(null)
      }
    },
    [
      refreshBusy,
      setError,
      setImportOutcome,
      setLibraryError,
      setLibraryNotice,
      setLibraryUnreadable,
    ],
  )

  const transport = useWorkerTransport({ pendingRepliesRef, onSend, setError })
  const { dropPendingReplies, dropUnsent, restartWorker, setWorkerStopped } = transport
  const { automaticRestartCountRef, send: sendToWorker } = transport

  // Signed out, each worker starts from the library kept in this browser, once. While the account
  // is still loading it waits, so a signed-in account's page never shows the device library.
  const deviceLoadedRef = useRef(false)
  const loadDeviceOnce = useCallback(() => {
    const { status } = accountRef.current
    if (deviceLoadedRef.current || (status !== 'signed-out' && status !== 'unavailable')) return
    deviceLoadedRef.current = true
    sendToWorker({ type: 'loadDevice', settings: settingsRef.current, ...storedPeriodRequest() })
  }, [sendToWorker])

  /** Asks the worker for a saved activity's route, under the signed-in account when there is one. */
  const loadRoute = useCallback(
    (id: string, fromOriginal: boolean) =>
      new Promise<RouteReply>((resolve) => {
        const { status, me } = accountRef.current
        const userId = status === 'signed-in' ? me?.user.id : undefined
        sendToWorker(
          { type: 'routeShape', id, fromOriginal, ...(userId === undefined ? {} : { userId }) },
          undefined,
          (message) => resolve(replyOf(message)),
        )
      }),
    [sendToWorker],
  )

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
    latestBaseline: () => baselineOf(reportedRef.current),
  })
  const handleAccountIssue = useAccountIssue({
    accountRef,
    loadLibrary: libraryActions.loadLibrary,
  })

  /**
   * Empties every queue: the requests waiting for a worker, the requests the worker still owes, the
   * files analysed while the account loads, and the imports waiting for the library. Both the stop
   * and an account change use it.
   */
  const clearQueues = useCallback(() => {
    dropPendingReplies()
    dropUnsent()
    drainBatches(provisionalImportsRef)
    drainBatches(libraryWaitRef)
    refreshBusy()
  }, [dropPendingReplies, dropUnsent, libraryWaitRef, provisionalImportsRef, refreshBusy])

  /**
   * The summary was dismissed, so what moved goes with it. The baseline stays: an import still
   * waiting for its reply compares with it, and the next import replaces it.
   */
  const dismissSummary = useCallback(() => setImportChange(null), [setImportChange])

  // A clear keeps the chosen period: the session holds it, so nothing else is sent.
  const clearSession = useCallback(
    () => sendToWorker({ type: 'clear', forgetDevice: false }),
    [sendToWorker],
  )

  // A stop cancels the work in progress and keeps the result on screen. The worker is replaced, and
  // its account pass reloads the kept library, which replaces the result with what was saved.
  const stop = useCallback(() => {
    clearQueues()
    setProgress(null)
    setUploading(null)
    setImportOutcome(null)
    setRebuildNotice(null)
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(STOPPED_BY_USER, null, true)
    restartWorker()
  }, [
    automaticRestartCountRef,
    clearQueues,
    restartWorker,
    setError,
    setImportOutcome,
    setProgress,
    setRebuildNotice,
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
  })

  const { massKg, bikeMassKg } = settings
  const { send } = transport
  useEffect(() => {
    const changed =
      settingsRef.current.massKg !== massKg || settingsRef.current.bikeMassKg !== bikeMassKg
    settingsRef.current = { massKg, bikeMassKg }
    if (changed) send({ type: 'setSettings', settings: settingsRef.current })
  }, [massKg, bikeMassKg, send])

  useGradeTrendRequest(gradeTrend, settingsRef, send)
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
    clearSession,
  })

  return {
    state: imports.state,
    busy: imports.busy,
    waitingReason: imports.waitingReason ?? (imports.progress?.paused ? SAVES_PAUSED : null),
    progress: imports.progress,
    uploading: imports.uploading,
    savedCount: imports.savedCount,
    error,
    errorIssue,
    errorNeutral: errorNotice?.neutral ?? false,
    workerStopped: transport.workerStopped,
    stop,
    retryWorker: transport.retryWorker,
    libraryStatus: library.libraryStatus,
    restoring: library.restoring,
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
    activitySplits: libraryActions.activitySplits,
    rebuildNotice: imports.rebuildNotice,
    rebuildSavedActivities: importActions.rebuildSavedActivities,
    addFiles: importActions.addFiles,
    loadSample: importActions.loadSample,
    setRange: importActions.setRange,
    clear: importActions.clear,
    loadRoute,
  }
}

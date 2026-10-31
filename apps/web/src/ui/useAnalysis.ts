import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sameAnalysisSettings, sameCountedRuns } from '@rca/core/athlete'
import type { SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest } from '../worker/protocol'
import type { AnalysisController } from './analysis/controller'
import { useAccountIssue, useAccountTransitions } from './analysis/accountSync'
import { SAVES_PAUSED, STILL_WORKING, STOPPED_BY_USER, WAITING_FOR_LIBRARY } from './analysis/copy'
import { useImportActions } from './analysis/importActions'
import { useKeptLibraryLoad } from './analysis/keptLibraryLoad'
import { isQuietRequest, keepsError } from './analysis/quietRequests'
import { baselineOf, useImportState } from './analysis/importState'
import { useLibraryActions } from './analysis/libraryActions'
import { useLibraryState } from './analysis/libraryState'
import { useLibraryTabs } from './analysis/libraryTabs'
import type { Account, ErrorNotice, LibraryStatus, Pending } from './analysis/model'
import { drainBatches, isDeletion } from './analysis/model'
import { useWorkerEvents } from './analysis/workerEvents'
import { useWorkerWatchdog } from './analysis/workerWatchdog'
import { useWorkerTransport } from './analysis/workerTransport'
import { replyOf } from './routeReply'
import type { RouteReply } from './routeReply'
import type { AccountStatus } from './useAccount'
import { useActivityTraceRequest } from './analysis/useActivityTraceRequest'

export type { LibraryStatus }
export { DEVICE_GRACE_MS } from './analysis/keptLibraryLoad'
export type { AnalysisController }

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
  const { setLibraryAction, setLibraryNotice, setLibraryError, resetNoticesFor, libraryWaitRef } =
    library
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
      if (!keepsError(request)) setError(null)
      // A new import or rebuild replaces the outcome of the last library change, and so does the sample or a
      // clear, which leave nothing for that outcome to be about: the landing page would say it unprompted.
      if (
        request.type === 'addFiles' ||
        request.type === 'rebuildStale' ||
        request.type === 'loadSample' ||
        request.type === 'clear'
      ) {
        setLibraryNotice(null)
        setLibraryError(null)
      }
      resetNoticesFor(request)
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
    [refreshBusy, resetNoticesFor, setError, setImportOutcome, setLibraryError, setLibraryNotice],
  )

  const transport = useWorkerTransport({
    pendingRepliesRef,
    onSend,
    onDropped: refreshBusy,
    setError,
  })
  const { dropPendingReplies, dropUnsent, restartWorker, setWorkerStopped } = transport
  const { automaticRestartCountRef, send: sendToWorker } = transport
  const loadTrace = useActivityTraceRequest(sendToWorker, accountRef)

  const { deviceLoadedRef, loadDeviceOnce } = useKeptLibraryLoad({
    accountRef,
    settingsRef,
    send: sendToWorker,
    provisionalImportsRef,
    libraryWaitRef,
  })

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

  const { libraryChanged } = useLibraryTabs({
    accountRef,
    settingsRef,
    send: sendToWorker,
    libraryStatus: library.libraryStatus,
    loadLibrary: libraryActions.loadLibrary,
    busy: imports.busy,
  })
  const eventDeps = {
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
    reloadLibrary: () => {
      const { status, me } = accountRef.current
      // Not while an import is running: it is reading the library it will end in.
      if (status === 'signed-in' && me !== null && !imports.busy)
        libraryActions.loadLibrary(me.user.id)
    },
    libraryChanged,
  }
  useWorkerEvents(eventDeps)
  useWorkerWatchdog({
    events: eventDeps,
    showStillWorking: () =>
      setErrorNotice((notice) => notice ?? { message: STILL_WORKING, issue: null, neutral: true }),
    clearStillWorking: () =>
      setErrorNotice((notice) => (notice?.message === STILL_WORKING ? null : notice)),
  })

  const { send } = transport
  // The analysis is redone when a mass changes, dated ones included, when what the heart-rate reference reads changes
  // (the year of birth and an entered maximum heart rate), or when the runs counted at walking pace change. Other dated
  // settings only ride along on later requests, since no analysis depends on them.
  useEffect(() => {
    const changed =
      !sameAnalysisSettings(settingsRef.current, settings) ||
      !sameCountedRuns(settingsRef.current, settings)
    settingsRef.current = settings
    if (changed) send({ type: 'setSettings', settings })
  }, [settings, send])

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
    keepProvisional: () => sendToWorker({ type: 'keepProvisional', settings: settingsRef.current }),
    deviceLoaded: () => deviceLoadedRef.current,
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
    detail: library.detail,
    missingOriginals: library.missingOriginals,
    outdatedWithOriginal: library.outdatedWithOriginal,
    libraryUnreadable: library.libraryUnreadable,
    deviceIssue: library.deviceIssue,
    outbox: library.outbox,
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
    loadTrace,
  }
}

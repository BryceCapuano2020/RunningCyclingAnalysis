import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { AnalysisController } from './controller'
import { useAccountIssue, useAccountTransitions } from './accountSync'
import { SAVES_PAUSED, STILL_WORKING, WAITING_FOR_LIBRARY } from './copy'
import { useAdoptionActions } from './adoptionActions'
import { useSettingsSync } from './useSettingsSync'
import { useImportActions } from './importActions'
import { useAccountCheckIn } from './accountCheckIn'
import { accountBaseline, shownChange, useAccountImportChange } from './accountImportChange'
import { useAccountResults, useShownResults } from './accountResults'
import { useOnSend } from './onSend'
import { useQueueControl } from './queueControl'
import { useImportManifest } from './importManifestHook'
import type { ManifestScope } from '../importManifest'
import { useKeptLibraryLoad } from './keptLibraryLoad'
import { isQuietRequest } from './quietRequests'
import { baselineOf, useImportState } from './importState'
import { useLibraryActions } from './libraryActions'
import { useLibraryState } from './libraryState'
import { useLibraryTabs } from './libraryTabs'
import type { Account, ErrorNotice, LibraryStatus, Pending } from './model'
import { accountPending, isDeletion } from './model'
import { useWorkerEvents } from './workerEvents'
import { useWorkerWatchdog } from './workerWatchdog'
import { workerStartsWithPage } from './workerStart'
import { useWorkerTransport } from './workerTransport'
import type { AccountStatus } from '../useAccount'
import { useActivityTraceRequest } from './useActivityTraceRequest'
import { useRouteRequest } from './useRouteRequest'

export { DEVICE_GRACE_MS } from './keptLibraryLoad'
export type { AnalysisController, LibraryStatus }

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
export function useLiveAnalysis(settings: AthleteSettings, account: Account): AnalysisController {
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
  // A signed-in account's results are the server's; the page never shows one the browser computed for it.
  const userId = account.status === 'signed-in' && account.me !== null ? account.me.user.id : null
  // The index is read again when the server's library moves past it; the reader is made below, once its parts exist.
  const indexBehindRef = useRef<() => void>(() => undefined)
  const accountResults = useAccountResults(
    userId,
    account.sessionExpired === true,
    !imports.busy,
    () => indexBehindRef.current(),
  )
  // What the page shows: the account's results, with an expired session keeping them until a state of the device's own arrives.
  const shown = useShownResults(
    accountResults.results,
    userId !== null,
    account.sessionExpired === true,
    imports,
  )
  const { setLibraryAction, libraryWaitRef } = library
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

  // What the page is showing decides which library the record of imports is about.
  const manifestScope: ManifestScope | null =
    account.status === 'signed-in' && account.me !== null
      ? `account:${account.me.user.id}`
      : accountPending(account)
        ? null
        : 'device'
  const manifest = useImportManifest(manifestScope)
  const { begin: beginManifest, fail: failManifest, forget: forgetManifest } = manifest

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

  const onSend = useOnSend({ refreshBusy, beginManifest, setError, library, imports })

  const transport = useWorkerTransport({
    pendingRepliesRef,
    onSend,
    onDropped: refreshBusy,
    setError,
    startWorker: workerStartsWithPage,
  })
  const { dropPendingReplies, dropUnsent, restartWorker, setWorkerStopped } = transport
  const { automaticRestartCountRef, send: sendToWorker } = transport
  const loadTrace = useActivityTraceRequest(sendToWorker, accountRef)

  const { deviceLoadedRef, loadDeviceOnce } = useKeptLibraryLoad({
    accountRef,
    settingsRef,
    send: sendToWorker,
    workerRunning: () => transport.workerRef.current !== null,
    provisionalImportsRef,
    libraryWaitRef,
  })

  const loadRoute = useRouteRequest(sendToWorker, accountRef)

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
    latestBaseline: () =>
      userId === null
        ? baselineOf(reportedRef.current)
        : accountBaseline(shown.state, accountResults.results),
  })
  const adoptionActions = useAdoptionActions({ transport, accountRef, settingsRef })
  const handleAccountIssue = useAccountIssue({
    accountRef,
    loadLibrary: libraryActions.loadLibrary,
  })

  const checkIn = useAccountCheckIn(
    userId === null ? null : (accountResults.results?.snapshot ?? null),
    library.libraryStatus === 'loaded',
    libraryActions.requestCheckIn,
    library.setCheckIn,
  )
  const importChange = useAccountImportChange({
    results: accountResults.results,
    userId,
    checkIn: library.checkIn,
    checkInVersion: checkIn.version,
    setImportChange,
  })

  /**
   * The summary was dismissed, so what moved goes with it. The baseline stays: an import still
   * waiting for its reply compares with it, and the next import replaces it.
   */
  const dismissSummary = useCallback(() => {
    importChange.clear()
    setImportChange(null)
  }, [importChange, setImportChange])
  const { setAdoption } = library
  const dismissAdoption = useCallback(() => setAdoption(null), [setAdoption])

  const { clearQueues, clearSession, stop, clear } = useQueueControl({
    failManifest,
    forgetManifest,
    dropPendingReplies,
    dropUnsent,
    provisionalImportsRef,
    libraryWaitRef,
    refreshBusy,
    send: sendToWorker,
    accountRef,
    clearAll: importActions.clear,
    stopWith: {
      setProgress,
      setUploading,
      setImportOutcome,
      setRebuildNotice,
      setWorkerStopped,
      automaticRestartCountRef,
      setError,
      restartWorker,
    },
  })

  const { libraryChanged, indexBehind } = useLibraryTabs({
    accountRef,
    settingsRef,
    send: sendToWorker,
    libraryStatus: library.libraryStatus,
    loadLibrary: libraryActions.loadLibrary,
    busy: imports.busy,
  })
  useEffect(() => {
    indexBehindRef.current = indexBehind
  }, [indexBehind])
  const eventDeps = {
    refreshResults: accountResults.refresh,
    indexListed: accountResults.indexListed,
    importLanded: importChange.landed,
    askCheckInAgain: checkIn.again,
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
    manifest,
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

  useSettingsSync(settings, settingsRef, transport.send)

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
    state: shown.state,
    accountLift: shown.lift,
    ...(shown.stale ? { copyStale: true } : {}),
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
    resumeSaves: libraryActions.resumeSaves,
    detail: library.detail,
    missingOriginals: library.missingOriginals,
    outdatedWithOriginal: library.outdatedWithOriginal,
    checkIn: library.checkIn,
    markCheckInSeen: libraryActions.markCheckInSeen,
    libraryUnreadable: library.libraryUnreadable,
    deviceIssue: library.deviceIssue,
    outbox: library.outbox,
    deviceOffer: library.deviceOffer,
    adoption: library.adoption,
    adoptDevice: adoptionActions.adoptDevice,
    forgetDeviceLibrary: adoptionActions.forgetDeviceLibrary,
    dismissAdoption,
    importOutcome: imports.importOutcome,
    incompleteImport: manifest.incomplete,
    acceptIncompleteImport: () => {
      manifest.accept()
      libraryActions.acceptPartialImport()
    },
    // The change belongs to the outcome on screen; a cleared or replaced summary drops it.
    importChange: shownChange(imports.importChange, imports.importOutcome),
    dismissSummary,
    savedActivities: library.savedActivities,
    libraryAction: library.libraryAction,
    libraryNotice: library.libraryNotice,
    libraryError: library.libraryError,
    deleteActivity: libraryActions.deleteActivity,
    renameActivity: libraryActions.renameActivity,
    exportData: libraryActions.exportData,
    activitySplits: libraryActions.activitySplits,
    rebuildNotice: imports.rebuildNotice,
    rebuildSavedActivities: importActions.rebuildSavedActivities,
    undoLabels: importActions.undoLabels,
    addFiles: importActions.addFiles,
    loadSample: importActions.loadSample,
    setRange: importActions.setRange,
    clear,
    loadRoute,
    loadTrace,
  }
}

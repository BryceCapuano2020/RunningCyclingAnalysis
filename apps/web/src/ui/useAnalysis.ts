import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type {
  ImportOutcome,
  SavedActivity,
  WorkerRequest,
  WorkerResponse,
} from '../worker/protocol'
import type { AccountController, AccountStatus } from './useAccount'

/** 'loaded' is the only state in which an import may be sent to the signed-in library. */
export type LibraryStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export interface AnalysisController {
  state: SessionState
  busy: boolean
  /** Number of FIT files read so far during an import. */
  progress: number | null
  /** Number of files uploaded so far during an import that keeps files, otherwise null. */
  uploading: number | null
  error: string | null
  workerStopped: boolean
  stop: () => void
  retryWorker: () => void
  libraryStatus: LibraryStatus
  /** Reads the signed-in library again. Imports made meanwhile run once it has loaded. */
  retryLibrary: () => void
  /** Saved activities whose original file is not in the library. */
  missingOriginals: number
  importOutcome: ImportOutcome | null
  savedActivities: SavedActivity[]
  deleteActivity: (id: string) => void
  rebuildNotice: string | null
  rebuildSavedActivities: () => void
  addFiles: (files: File[]) => void
  loadSample: () => void
  setRange: (rangeDays: number | null) => void
  clear: () => void
}

type Account = Pick<AccountController, 'status' | 'me'> &
  Partial<
    Pick<AccountController, 'flushProfileWrites' | 'markExpired' | 'refresh' | 'sessionExpired'>
  >

const EMPTY: SessionState = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
  rangeDays: null,
  syncIssues: [],
  outdatedActivities: 0,
  incompatibleActivities: 0,
}

/** A request the worker has not answered yet. */
interface Pending {
  kind: WorkerRequest['type']
}

/**
 * Runs the analysis in a worker. While signed in, the account's stored activities are loaded when
 * sign-in completes, and imports are saved to the account once that library has loaded. Signing
 * out clears the library.
 */
export function useAnalysis(settings: AthleteSettings, account: Account): AnalysisController {
  const workerRef = useRef<Worker | null>(null)
  const settingsRef = useRef(settings)
  const accountRef = useRef<Account>(account)
  const accountEpochRef = useRef(0)
  // Starts as 'loading' so an account that is already known on mount counts as a sign-in.
  const previousStatusRef = useRef<AccountStatus>('loading')
  const previousUserIdRef = useRef<string | null>(null)
  const workerGenerationRef = useRef(0)
  // Requests made while there is no worker (during a restart) wait here, in order.
  const unsentRef = useRef<WorkerRequest[]>([])
  const pendingRef = useRef(0)
  const pendingRepliesRef = useRef<Pending[]>([])
  const pendingAsyncImportsRef = useRef(0)
  // A file dropped before the account is known must not be analysed and then overwritten by the
  // initial server hydration. Keep it until the account state is known.
  const deferredImportsRef = useRef<File[][]>([])
  // Signed-in imports wait here until the library has loaded. Otherwise a failed load followed by
  // an import would replace the whole library with only the new files.
  const libraryWaitRef = useRef<File[][]>([])
  const libraryStatusRef = useRef<LibraryStatus>('idle')
  const automaticRestartCountRef = useRef(0)
  const [state, setState] = useState<SessionState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<AnalysisController['progress']>(null)
  const [uploading, setUploading] = useState<AnalysisController['uploading']>(null)
  const [error, setError] = useState<string | null>(null)
  const [workerStopped, setWorkerStopped] = useState(false)
  const [rebuildNotice, setRebuildNotice] = useState<string | null>(null)
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>('idle')
  const [missingOriginals, setMissingOriginals] = useState(0)
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null)
  const [savedActivities, setSavedActivities] = useState<SavedActivity[]>([])
  const [workerGeneration, setWorkerGeneration] = useState(0)

  // Keep the latest committed account available to async import preparation without waiting for
  // the account-transition effect to run.
  useLayoutEffect(() => {
    accountRef.current = account
  }, [account])

  const restartWorker = useCallback(() => {
    const next = workerGenerationRef.current + 1
    workerGenerationRef.current = next
    setWorkerGeneration(next)
  }, [])

  const setLibrary = useCallback((next: LibraryStatus) => {
    libraryStatusRef.current = next
    setLibraryStatus(next)
  }, [])

  /** Busy while a request is outstanding or an import is still being prepared. */
  const refreshBusy = useCallback(() => {
    setBusy(
      pendingRef.current > 0 ||
        pendingAsyncImportsRef.current > 0 ||
        deferredImportsRef.current.length > 0,
    )
  }, [])

  const send = useCallback((request: WorkerRequest) => {
    const worker = workerRef.current
    if (worker === null) {
      unsentRef.current.push(request)
      return
    }
    pendingRef.current += 1
    pendingRepliesRef.current.push({ kind: request.type })
    setBusy(true)
    if (request.type !== 'loadServer') setError(null)
    worker.postMessage(request)
  }, [])

  const flushUnsent = useCallback(() => {
    for (const request of unsentRef.current.splice(0)) send(request)
  }, [send])

  const loadLibrary = useCallback(
    (userId: string) => {
      setLibrary('loading')
      send({ type: 'loadServer', settings: settingsRef.current, userId })
    },
    [send, setLibrary],
  )

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
            if (accountEpochRef.current !== accountEpoch && current.status !== 'loading') {
              setError('The account changed before this import started. Select the files again.')
            }
            return
          }
          if (
            accountEpochRef.current !== accountEpoch ||
            current.status !== 'signed-in' ||
            savedMe?.user.id !== submittedUserId
          ) {
            setError('The account changed before this import started. Select the files again.')
            return
          }
          if (libraryStatusRef.current !== 'loaded') {
            // The library is reloading or failed to load; hold the import until it has loaded.
            libraryWaitRef.current.push(files)
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
            setError(
              'Could not confirm your saved account settings. Retry saving your settings, then re-import these files; no activities were imported.',
            )
          }
        } finally {
          pendingAsyncImportsRef.current = Math.max(0, pendingAsyncImportsRef.current - 1)
          refreshBusy()
        }
      })()
    },
    [refreshBusy, send],
  )

  /** Reloads the account's library after the server reports a different account for it. */
  const reconcileAccount = useCallback(() => {
    const current = accountRef.current
    const refresh = current.refresh
    const submittedUserId = current.me?.user.id
    if (refresh === undefined || submittedUserId === undefined) return
    refresh().then(
      (found) => {
        // A different account is handled by the account transition; the same one is reloaded here.
        if (found?.user.id === submittedUserId) loadLibrary(submittedUserId)
      },
      () => undefined,
    )
  }, [loadLibrary])

  const handleAccountIssue = useCallback(
    (issue: SyncIssueCode) => {
      if (issue === 'signed-out') accountRef.current.markExpired?.()
      else if (issue === 'account-changed') reconcileAccount()
    },
    [reconcileAccount],
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
        if (libraryStatusRef.current === 'loaded') {
          queueSignedInImport(files, current.me.user.id)
        } else {
          libraryWaitRef.current.push(files)
        }
        return
      }
      send({ type: 'addFiles', files, settings: settingsRef.current, sync: null })
    },
    [queueSignedInImport, refreshBusy, send],
  )

  useEffect(() => {
    const generation = workerGeneration
    const worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (generation !== workerGenerationRef.current) return
      const message = event.data
      if (message.type === 'progress') {
        setProgress(message.filesRead)
        setUploading(message.uploaded ?? null)
        return
      }
      if (message.type === 'missingOriginals') {
        setMissingOriginals(message.count)
        return
      }
      if (message.type === 'libraryActivities') {
        setSavedActivities(message.activities)
        return
      }
      if (message.type === 'accountIssue') {
        handleAccountIssue(message.issue)
        return
      }
      // Replies arrive in request order; stay busy until the last outstanding one.
      const pending = pendingRepliesRef.current.shift()
      pendingRef.current = Math.max(0, pendingRef.current - 1)
      refreshBusy()
      automaticRestartCountRef.current = 0
      setWorkerStopped(false)
      setProgress(null)
      setUploading(null)
      if (message.type === 'error') {
        // A failed library load is shown by its own message, not as a generic error.
        if (pending?.kind === 'loadServer') setLibrary('failed')
        else setError(message.message)
        if (message.issue !== undefined) handleAccountIssue(message.issue)
        return
      }
      setState(message.state)
      if (message.type === 'state') {
        if (message.outcome) setImportOutcome(message.outcome)
        if (pending?.kind === 'loadServer') {
          setLibrary('loaded')
          // Imports made while the library loaded join it now, in the order they were made.
          for (const files of libraryWaitRef.current.splice(0)) addFiles(files)
        }
        return
      }
      const notice = [
        `Rebuilt ${message.rebuilt} saved ${message.rebuilt === 1 ? 'activity' : 'activities'}.`,
      ]
      if (message.missing > 0) {
        notice.push(
          `${message.missing} original ${message.missing === 1 ? 'file is' : 'files are'} missing or could not be matched; re-import those original FIT files.`,
        )
      }
      if (message.failed > 0) {
        notice.push(
          `${message.failed} could not be rebuilt; try again when the server is available.`,
        )
      }
      setRebuildNotice(notice.join(' '))
    }
    worker.onerror = (event) => {
      if (generation !== workerGenerationRef.current) return
      pendingRef.current = 0
      pendingRepliesRef.current = []
      refreshBusy()
      setProgress(null)
      setUploading(null)
      const current = accountRef.current
      if (current.status !== 'signed-in') setState(EMPTY)
      const willRestart = automaticRestartCountRef.current < 1
      setError(
        current.status === 'signed-in' && willRestart
          ? 'The analysis worker stopped. Your saved library is reloading; re-import any local files that were not saved.'
          : current.status === 'signed-in'
            ? 'The analysis worker stopped. Restart analysis to reload your saved library; re-import any local files that were not saved.'
            : current.status === 'signed-out'
              ? 'The analysis worker stopped. Re-import your files to continue.'
              : event.message || 'The analysis worker failed. Re-import your files to continue.',
      )
      // Replace a worker once automatically. Repeated startup failures need an explicit retry so
      // a broken module or browser resource cannot trigger an unbounded restart loop.
      if (willRestart) {
        automaticRestartCountRef.current += 1
        restartWorker()
      } else {
        worker.terminate()
        workerRef.current = null
        setWorkerStopped(true)
        if (current.status === 'signed-in') setLibrary('failed')
      }
    }
    workerRef.current = worker
    flushUnsent()
    return () => {
      worker.terminate()
      workerRef.current = null
      pendingRef.current = 0
      pendingRepliesRef.current = []
      // In React StrictMode, effects are cleaned up and set up again on mount. The first
      // worker is terminated, so its initial account-load request must be sent to the new one.
      previousStatusRef.current = 'loading'
      previousUserIdRef.current = null
    }
  }, [
    flushUnsent,
    handleAccountIssue,
    addFiles,
    refreshBusy,
    restartWorker,
    setLibrary,
    workerGeneration,
  ])

  const { massKg, bikeMassKg } = settings
  useEffect(() => {
    const changed =
      settingsRef.current.massKg !== massKg || settingsRef.current.bikeMassKg !== bikeMassKg
    settingsRef.current = { massKg, bikeMassKg }
    if (changed) send({ type: 'setSettings', settings: settingsRef.current })
  }, [massKg, bikeMassKg, send])

  const { status: accountStatus, me, sessionExpired } = account
  useEffect(() => {
    const userId = me?.user.id ?? null
    const before = previousStatusRef.current
    const previousUserId = previousUserIdRef.current
    previousStatusRef.current = accountStatus
    previousUserIdRef.current = userId
    const accountChanged =
      before === 'signed-in' && (accountStatus !== 'signed-in' || userId !== previousUserId)
    if (accountChanged && accountStatus === 'signed-out' && sessionExpired) {
      // The session ended without a sign-out. Keep what is on screen and stop saving; imports
      // that were waiting for the library are analysed locally.
      accountEpochRef.current += 1
      setLibrary('idle')
      for (const files of libraryWaitRef.current.splice(0)) addFiles(files)
      return
    }
    if (accountChanged) {
      const canceled = pendingAsyncImportsRef.current > 0 || libraryWaitRef.current.length > 0
      accountEpochRef.current += 1
      // Stop A's queued sync operations before a later sign-in can give them B's cookie. The new
      // worker starts empty; a signed-in account will be hydrated by the next effect pass.
      deferredImportsRef.current = []
      libraryWaitRef.current = []
      unsentRef.current = []
      setBusy(pendingAsyncImportsRef.current > 0)
      setState(EMPTY)
      setProgress(null)
      setUploading(null)
      setError(
        canceled
          ? 'An import was canceled because the account changed. Select the files again.'
          : null,
      )
      setRebuildNotice(null)
      setWorkerStopped(false)
      setMissingOriginals(0)
      setSavedActivities([])
      setImportOutcome(null)
      setLibrary('idle')
      automaticRestartCountRef.current = 0
      // Make the next effect pass hydrate the new signed-in identity even for a direct A → B
      // switch where accountStatus remains "signed-in" throughout.
      previousStatusRef.current = 'signed-out'
      restartWorker()
      return
    }
    if (accountStatus === 'signed-in' && before !== 'signed-in') {
      if (me === null) return
      if (before !== 'loading') {
        // A new sign-in starts with a new session, so earlier sync issues are cleared. The new
        // worker's account pass loads the library and sends the deferred imports.
        setState(EMPTY)
        setError(null)
        restartWorker()
        return
      }
      loadLibrary(me.user.id)
      const deferred = deferredImportsRef.current
      deferredImportsRef.current = []
      for (const files of deferred) addFiles(files)
    } else if (before === 'loading' && accountStatus !== 'loading') {
      const deferred = deferredImportsRef.current
      deferredImportsRef.current = []
      for (const files of deferred) addFiles(files)
    }
  }, [
    accountStatus,
    me,
    sessionExpired,
    addFiles,
    loadLibrary,
    restartWorker,
    setLibrary,
    workerGeneration,
  ])

  const loadSample = useCallback(() => {
    if (accountRef.current.status === 'signed-in') {
      setError(
        'Sample data cannot replace your saved library. Add your own files, or sign out to try the sample.',
      )
      return
    }
    send({ type: 'loadSample', settings: settingsRef.current })
  }, [send])
  const setRange = useCallback(
    (rangeDays: number | null) =>
      send({ type: 'setRange', rangeDays, settings: settingsRef.current }),
    [send],
  )
  const clear = useCallback(() => send({ type: 'clear' }), [send])
  const rebuildSavedActivities = useCallback(() => {
    setRebuildNotice(null)
    const current = accountRef.current
    const userId = current.status === 'signed-in' ? current.me?.user.id : undefined
    if (userId === undefined || current.me === null) return
    if (current.me.fileRetentionAvailable === false) {
      setRebuildNotice(
        'Saved originals cannot be accessed on this deployment. Import the original FIT files to rebuild these activities; existing saved originals are not deleted.',
      )
      return
    }
    send({ type: 'rebuildStale', settings: settingsRef.current, userId })
  }, [send])
  const stop = useCallback(() => {
    pendingRepliesRef.current = []
    pendingRef.current = 0
    deferredImportsRef.current = []
    libraryWaitRef.current = []
    unsentRef.current = []
    setBusy(false)
    setProgress(null)
    setUploading(null)
    setState(EMPTY)
    setRebuildNotice(null)
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(
      accountRef.current.status === 'signed-in'
        ? 'Analysis stopped. Saved activities are reloading; re-import any local files that were not saved.'
        : 'Analysis stopped. Re-import your files to continue.',
    )
    restartWorker()
  }, [restartWorker])
  const retryWorker = useCallback(() => {
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(null)
    restartWorker()
  }, [restartWorker])
  const retryLibrary = useCallback(() => {
    const current = accountRef.current
    if (current.status !== 'signed-in' || current.me === null) return
    // With no worker, a restart re-reads the library as its account effect runs.
    if (workerRef.current === null) restartWorker()
    else loadLibrary(current.me.user.id)
  }, [loadLibrary, restartWorker])
  const deleteActivity = useCallback(
    (id: string) => {
      const current = accountRef.current
      if (
        current.status !== 'signed-in' ||
        current.me === null ||
        libraryStatusRef.current !== 'loaded'
      )
        return
      send({
        type: 'deleteActivity',
        id,
        userId: current.me.user.id,
        settings: settingsRef.current,
      })
    },
    [send],
  )

  return {
    state,
    busy,
    progress,
    uploading,
    error,
    workerStopped,
    stop,
    retryWorker,
    libraryStatus,
    retryLibrary,
    missingOriginals,
    importOutcome,
    savedActivities,
    deleteActivity,
    rebuildNotice,
    rebuildSavedActivities,
    addFiles,
    loadSample,
    setRange,
    clear,
  }
}

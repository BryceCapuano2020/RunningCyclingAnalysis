import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DAILY_LIMITS } from '@rca/contract'
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

const WAITING_FOR_LIBRARY = 'Waiting for your library to load'
const LIBRARY_NOT_LOADED =
  'Your library is not loaded, so these files were not imported. Retry loading your library, then add them again.'
const STOPPED = 'Analysis is stopped, so this did not run. Restart analysis, then try again.'
const INTERRUPTED = 'Your import was interrupted. Add the files again.'
const DAILY_LIMIT =
  'You have reached the daily limit for this account. The limit resets at 00:00 UTC.'
const DELETE_DAILY_LIMIT = `You can delete up to ${DAILY_LIMITS.activityDelete} activities per day. The limit resets at 00:00 UTC.`
const LIBRARY_DAILY_LIMIT = `You have reached today's limit for loading your library (${DAILY_LIMITS.read} per day). It resets at 00:00 UTC.`

/** The sentence for saved activities a rebuild could not reach because of a limit. */
function limitedSentence(
  count: number,
  kind: 'daily' | 'rate' | null,
  resetsAtMs: number | null,
): string {
  const noun = count === 1 ? 'activity was' : 'activities were'
  if (kind === 'rate') {
    return `${count} ${noun} not rebuilt. The server asked us to slow down; try again in a minute.`
  }
  const resetText =
    resetsAtMs === null
      ? 'Try again later.'
      : `Try again after ${new Date(resetsAtMs).toLocaleString()}.`
  if (kind === 'daily') {
    return `${count} ${noun} not rebuilt because the daily download limit (${DAILY_LIMITS.fileDownload} per day) was reached. ${resetText}`
  }
  return `${count} ${noun} not rebuilt. ${resetText}`
}

export interface AnalysisController {
  state: SessionState
  /** Import work is in progress or waiting. A library change such as a delete is not counted. */
  busy: boolean
  /** Why held imports are waiting, or null when nothing is waiting. */
  waitingReason: string | null
  /** Number of FIT files read so far during an import. */
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

/** A request the worker has not answered yet. `notice` is the confirmation shown on success. */
interface Pending {
  kind: WorkerRequest['type']
  notice?: string
}

interface ErrorNotice {
  message: string
  issue: SyncIssueCode | null
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
  // Set when the worker has stopped for good. Imports are refused, not queued, until a restart.
  const stoppedRef = useRef(false)
  // Requests made while there is no worker (during a restart) wait here, in order.
  const unsentRef = useRef<WorkerRequest[]>([])
  const pendingRepliesRef = useRef<Pending[]>([])
  const pendingAsyncImportsRef = useRef(0)
  // A file dropped before the account is known must not be analysed and then overwritten by the
  // initial server hydration. Keep it until the account state is known.
  const deferredImportsRef = useRef<File[][]>([])
  // Signed-in imports wait here until the library has loaded. Otherwise a failed load followed by
  // an import would replace the whole library with only the new files.
  const libraryWaitRef = useRef<File[][]>([])
  const libraryStatusRef = useRef<LibraryStatus>('idle')
  const savedActivitiesRef = useRef<SavedActivity[]>([])
  const automaticRestartCountRef = useRef(0)
  const [state, setState] = useState<SessionState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [waitingReason, setWaitingReason] = useState<string | null>(null)
  const [progress, setProgress] = useState<AnalysisController['progress']>(null)
  const [uploading, setUploading] = useState<AnalysisController['uploading']>(null)
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null)
  const [workerStopped, setWorkerStopped] = useState(false)
  const [rebuildNotice, setRebuildNotice] = useState<string | null>(null)
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>('idle')
  const [libraryAction, setLibraryAction] = useState<AnalysisController['libraryAction']>(null)
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [missingOriginals, setMissingOriginals] = useState(0)
  const [libraryUnreadable, setLibraryUnreadable] = useState(0)
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null)
  const [savedActivities, setSavedActivities] = useState<SavedActivity[]>([])
  const [workerGeneration, setWorkerGeneration] = useState(0)

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

  useLayoutEffect(() => {
    savedActivitiesRef.current = savedActivities
  }, [savedActivities])

  const restartWorker = useCallback(() => {
    const next = workerGenerationRef.current + 1
    workerGenerationRef.current = next
    // A new worker runs nothing that was refused while the old one was stopped.
    stoppedRef.current = false
    setWorkerGeneration(next)
  }, [])

  const setLibrary = useCallback((next: LibraryStatus) => {
    libraryStatusRef.current = next
    setLibraryStatus(next)
  }, [])

  /** Recomputes what the page shows as busy, waiting, and in a library change. */
  const refreshBusy = useCallback(() => {
    const replies = pendingRepliesRef.current
    setLibraryAction(
      replies.some((pending) => pending.kind === 'deleteActivity') ? 'deleting' : null,
    )
    setBusy(
      replies.some((pending) => pending.kind !== 'deleteActivity') ||
        pendingAsyncImportsRef.current > 0 ||
        deferredImportsRef.current.length > 0 ||
        libraryWaitRef.current.length > 0,
    )
    setWaitingReason(
      libraryWaitRef.current.length > 0 || deferredImportsRef.current.length > 0
        ? WAITING_FOR_LIBRARY
        : null,
    )
  }, [])

  const send = useCallback(
    (request: WorkerRequest, notice?: string) => {
      const worker = workerRef.current
      if (worker === null) {
        // Once the worker has stopped for good, nothing is queued for a later restart, so the
        // user is told to act again. Settings still queue: they must reach the next worker.
        if (stoppedRef.current && request.type !== 'setSettings') {
          setError(STOPPED)
          return
        }
        unsentRef.current.push(request)
        return
      }
      pendingRepliesRef.current.push({ kind: request.type, notice })
      refreshBusy()
      if (request.type !== 'loadServer') setError(null)
      // A new import or rebuild replaces the outcome of the last library change.
      if (request.type === 'addFiles' || request.type === 'rebuildStale') {
        setLibraryNotice(null)
        setLibraryError(null)
      }
      // A library load or rebuild reports the unreadable count afresh, so an old one is cleared.
      if (request.type === 'loadServer' || request.type === 'rebuildStale') {
        setLibraryUnreadable(0)
      }
      worker.postMessage(request)
    },
    [refreshBusy, setError],
  )

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
    [refreshBusy, setError],
  )

  /**
   * Marks the library failed. Imports held for it cannot run later, so they are dropped. Returns
   * whether any were dropped; the caller words that, so a worker-stopped message is not replaced.
   */
  const failLibrary = useCallback(() => {
    setLibrary('failed')
    const dropped = libraryWaitRef.current.length > 0
    libraryWaitRef.current = []
    refreshBusy()
    return dropped
  }, [refreshBusy, setLibrary])

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
              if (current.status !== 'loading') {
                setError('The account changed before this import started. Select the files again.')
              }
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
            setError('The account changed before this import started. Select the files again.')
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
    [holdForLibrary, refreshBusy, send, setError],
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
        if (libraryStatusRef.current === 'loaded') queueSignedInImport(files, current.me.user.id)
        else holdForLibrary(files)
        return
      }
      send({ type: 'addFiles', files, settings: settingsRef.current, sync: null })
    },
    [holdForLibrary, queueSignedInImport, refreshBusy, send],
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
      if (message.type === 'libraryUnreadable') {
        setLibraryUnreadable(message.count)
        return
      }
      if (message.type === 'accountIssue') {
        handleAccountIssue(message.issue)
        return
      }
      // Replies arrive in request order; the first pending request is the one this answers.
      const pending = pendingRepliesRef.current.shift()
      refreshBusy()
      automaticRestartCountRef.current = 0
      setWorkerStopped(false)
      setProgress(null)
      setUploading(null)
      if (message.type === 'error') {
        if (pending?.kind === 'loadServer') {
          const dropped = failLibrary()
          if (message.issue === 'daily-limit') setError(LIBRARY_DAILY_LIMIT, 'daily-limit')
          else if (dropped) setError(LIBRARY_NOT_LOADED)
        } else if (pending?.kind === 'deleteActivity') {
          setLibraryError(
            message.issue === 'daily-limit'
              ? DELETE_DAILY_LIMIT
              : `Could not delete the activity. ${message.message}`,
          )
        } else if (message.issue === 'daily-limit') {
          // A rebuild fails outright only when its first library listing is refused.
          setError(
            pending?.kind === 'rebuildStale' ? LIBRARY_DAILY_LIMIT : DAILY_LIMIT,
            'daily-limit',
          )
        } else setError(message.message)
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
          refreshBusy()
        }
        if (pending?.kind === 'deleteActivity') setLibraryNotice(pending.notice ?? null)
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
      if (message.limited > 0) {
        notice.push(limitedSentence(message.limited, message.limitKind, message.limitResetsAtMs))
      }
      setRebuildNotice(notice.join(' '))
    }
    worker.onerror = (event) => {
      if (generation !== workerGenerationRef.current) return
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
        stoppedRef.current = true
        setWorkerStopped(true)
        if (current.status === 'signed-in') failLibrary()
      }
    }
    workerRef.current = worker
    flushUnsent()
    return () => {
      worker.terminate()
      workerRef.current = null
      pendingRepliesRef.current = []
      // In React StrictMode, effects are cleaned up and set up again on mount. The first
      // worker is terminated, so its initial account-load request must be sent to the new one.
      previousStatusRef.current = 'loading'
      previousUserIdRef.current = null
    }
  }, [
    failLibrary,
    flushUnsent,
    handleAccountIssue,
    addFiles,
    refreshBusy,
    restartWorker,
    setError,
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
      setLibraryNotice(null)
      setLibraryError(null)
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
      // The old worker's replies are ignored by the generation check, so forget what it owes.
      pendingRepliesRef.current = []
      refreshBusy()
      setState(EMPTY)
      setProgress(null)
      setUploading(null)
      setError(
        canceled
          ? 'An import was canceled because the account changed. Select the files again.'
          : null,
      )
      setRebuildNotice(null)
      setLibraryNotice(null)
      setLibraryError(null)
      setWorkerStopped(false)
      setMissingOriginals(0)
      setLibraryUnreadable(0)
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
    refreshBusy,
    restartWorker,
    setError,
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
  }, [send, setError])
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
    deferredImportsRef.current = []
    libraryWaitRef.current = []
    unsentRef.current = []
    refreshBusy()
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
  }, [refreshBusy, restartWorker, setError])
  const retryWorker = useCallback(() => {
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(null)
    restartWorker()
  }, [restartWorker, setError])
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
      if (workerRef.current === null) {
        setLibraryError(STOPPED)
        return
      }
      const activity = savedActivitiesRef.current.find((saved) => saved.id === id)
      const notice = activity
        ? `Deleted ${activity.name} (${new Date(activity.startMs).toLocaleDateString()}).`
        : 'Deleted the activity.'
      setLibraryNotice(null)
      setLibraryError(null)
      send(
        { type: 'deleteActivity', id, userId: current.me.user.id, settings: settingsRef.current },
        notice,
      )
    },
    [send],
  )

  return {
    state,
    busy,
    waitingReason,
    progress,
    uploading,
    error,
    errorIssue,
    workerStopped,
    stop,
    retryWorker,
    libraryStatus,
    retryLibrary,
    missingOriginals,
    libraryUnreadable,
    importOutcome,
    savedActivities,
    libraryAction,
    libraryNotice,
    libraryError,
    deleteActivity,
    rebuildNotice,
    rebuildSavedActivities,
    addFiles,
    loadSample,
    setRange,
    clear,
  }
}

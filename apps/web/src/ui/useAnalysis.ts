import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'
import type { AccountController, AccountStatus } from './useAccount'

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
  rebuildNotice: string | null
  rebuildSavedActivities: () => void
  addFiles: (files: File[]) => void
  loadSample: () => void
  setRange: (rangeDays: number | null) => void
  clear: () => void
}

type Account = Pick<AccountController, 'status' | 'me'>

const EMPTY: SessionState = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
  rangeDays: null,
  syncFailures: 0,
  outdatedActivities: 0,
  incompatibleActivities: 0,
}

/**
 * Runs the analysis in a worker. While signed in, the account's stored activities are loaded when
 * sign-in completes, and imports are saved to the account. Signing out clears the library.
 */
export function useAnalysis(settings: AthleteSettings, account: Account): AnalysisController {
  const workerRef = useRef<Worker | null>(null)
  const settingsRef = useRef(settings)
  const accountRef = useRef<Account>(account)
  // Starts as 'loading' so an account that is already known on mount counts as a sign-in.
  const previousStatusRef = useRef<AccountStatus>('loading')
  const previousUserIdRef = useRef<string | null>(null)
  const workerGenerationRef = useRef(0)
  const pendingRef = useRef(0)
  // A file dropped before getMe resolves must not be analyzed and then overwritten by the
  // initial server hydration. Keep it until the account state is known, then send it after the
  // hydration request (the worker processes requests in order).
  const deferredImportsRef = useRef<File[][]>([])
  // The worker replies in request order. Mark old-account replies stale when signing out so a
  // slow import or library load cannot restore data after the library has been cleared.
  const pendingRepliesRef = useRef<{ ignoreResult: boolean }[]>([])
  const automaticRestartCountRef = useRef(0)
  const [state, setState] = useState<SessionState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<AnalysisController['progress']>(null)
  const [uploading, setUploading] = useState<AnalysisController['uploading']>(null)
  const [error, setError] = useState<string | null>(null)
  const [workerStopped, setWorkerStopped] = useState(false)
  const [rebuildNotice, setRebuildNotice] = useState<string | null>(null)
  const [workerGeneration, setWorkerGeneration] = useState(0)

  const restartWorker = useCallback(() => {
    const next = workerGenerationRef.current + 1
    workerGenerationRef.current = next
    setWorkerGeneration(next)
  }, [])

  const send = useCallback((request: WorkerRequest, ignoreResult = false) => {
    if (!workerRef.current) return
    pendingRef.current += 1
    pendingRepliesRef.current.push({ ignoreResult })
    setBusy(true)
    if (request.type !== 'loadServer') setError(null)
    workerRef.current.postMessage(request)
  }, [])

  useEffect(() => {
    const generation = workerGeneration
    const worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (generation !== workerGenerationRef.current) return
      const message = event.data
      if (message.type === 'progress') {
        if (pendingRepliesRef.current[0]?.ignoreResult) return
        setProgress(message.filesRead)
        setUploading(message.uploaded ?? null)
        return
      }
      // Replies arrive in request order; stay busy until the last outstanding one.
      const pending = pendingRepliesRef.current.shift()
      pendingRef.current = Math.max(0, pendingRef.current - 1)
      if (pendingRef.current === 0) setBusy(deferredImportsRef.current.length > 0)
      if (pending?.ignoreResult) return
      automaticRestartCountRef.current = 0
      setWorkerStopped(false)
      setProgress(null)
      setUploading(null)
      if (message.type === 'state') setState(message.state)
      else if (message.type === 'error') setError(message.message)
      else {
        setState(message.state)
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
    }
    worker.onerror = (event) => {
      if (generation !== workerGenerationRef.current) return
      pendingRef.current = 0
      const ignoreError =
        pendingRepliesRef.current.length > 0 &&
        pendingRepliesRef.current.every((pending) => pending.ignoreResult)
      pendingRepliesRef.current = []
      setBusy(false)
      setProgress(null)
      setUploading(null)
      if (!ignoreError) {
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
      }
      // Replace a worker once automatically. Repeated startup failures need an explicit retry so
      // a broken module or browser resource cannot trigger an unbounded restart loop.
      if (automaticRestartCountRef.current < 1) {
        automaticRestartCountRef.current += 1
        restartWorker()
      } else {
        worker.terminate()
        workerRef.current = null
        setWorkerStopped(true)
      }
    }
    workerRef.current = worker
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
  }, [restartWorker, workerGeneration])

  const { massKg, bikeMassKg } = settings
  useEffect(() => {
    const changed =
      settingsRef.current.massKg !== massKg || settingsRef.current.bikeMassKg !== bikeMassKg
    settingsRef.current = { massKg, bikeMassKg }
    if (changed) send({ type: 'setSettings', settings: settingsRef.current })
  }, [massKg, bikeMassKg, send])

  const { status: accountStatus, me } = account
  useEffect(() => {
    accountRef.current = { status: accountStatus, me }
    const userId = me?.user.id ?? null
    const before = previousStatusRef.current
    const previousUserId = previousUserIdRef.current
    previousStatusRef.current = accountStatus
    previousUserIdRef.current = userId
    const accountChanged =
      before === 'signed-in' && (accountStatus !== 'signed-in' || userId !== previousUserId)
    if (accountChanged) {
      // Stop A's queued sync operations before a later sign-in can give them B's cookie. The new
      // worker starts empty; a signed-in account will be hydrated by the next effect pass.
      pendingRepliesRef.current = pendingRepliesRef.current.map(() => ({ ignoreResult: true }))
      deferredImportsRef.current = []
      setState(EMPTY)
      setProgress(null)
      setUploading(null)
      setError(null)
      setRebuildNotice(null)
      setWorkerStopped(false)
      automaticRestartCountRef.current = 0
      // Make the next effect pass hydrate the new signed-in identity even for a direct A → B
      // switch where accountStatus remains "signed-in" throughout.
      previousStatusRef.current = 'signed-out'
      restartWorker()
      return
    }
    if (accountStatus === 'signed-in' && before !== 'signed-in') {
      const currentUserId = me?.user.id
      if (currentUserId === undefined) return
      send({ type: 'loadServer', settings: settingsRef.current, userId: currentUserId })
      const deferredImports = deferredImportsRef.current
      deferredImportsRef.current = []
      for (const files of deferredImports) {
        const current = accountRef.current
        send({
          type: 'addFiles',
          files,
          settings: settingsRef.current,
          sync:
            current.status === 'signed-in' && current.me !== null
              ? { keepFiles: current.me.profile.keepFiles, userId: current.me.user.id }
              : null,
        })
      }
    } else if (before === 'loading' && accountStatus !== 'loading') {
      const deferredImports = deferredImportsRef.current
      deferredImportsRef.current = []
      for (const files of deferredImports) {
        send({ type: 'addFiles', files, settings: settingsRef.current, sync: null })
      }
    }
  }, [accountStatus, me, send, restartWorker, workerGeneration])

  const addFiles = useCallback(
    (files: File[]) => {
      // File objects are cloned by reference, so the worker streams them without a copy here.
      if (files.length === 0) return
      const current = accountRef.current
      if (current.status === 'loading') {
        deferredImportsRef.current.push(files)
        setBusy(true)
        return
      }
      const sync =
        current.status === 'signed-in' && current.me !== null
          ? { keepFiles: current.me.profile.keepFiles, userId: current.me.user.id }
          : null
      send({ type: 'addFiles', files, settings: settingsRef.current, sync })
    },
    [send],
  )
  const loadSample = useCallback(
    () => send({ type: 'loadSample', settings: settingsRef.current }),
    [send],
  )
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
    if (userId !== undefined) {
      send({ type: 'rebuildStale', settings: settingsRef.current, userId })
    }
  }, [send])
  const stop = useCallback(() => {
    pendingRepliesRef.current = []
    pendingRef.current = 0
    deferredImportsRef.current = []
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

  return {
    state,
    busy,
    progress,
    uploading,
    error,
    workerStopped,
    stop,
    retryWorker,
    rebuildNotice,
    rebuildSavedActivities,
    addFiles,
    loadSample,
    setRange,
    clear,
  }
}

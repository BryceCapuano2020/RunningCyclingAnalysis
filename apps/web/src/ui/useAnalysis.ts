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
  const pendingRef = useRef(0)
  const [state, setState] = useState<SessionState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<AnalysisController['progress']>(null)
  const [uploading, setUploading] = useState<AnalysisController['uploading']>(null)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback((request: WorkerRequest) => {
    if (!workerRef.current) return
    pendingRef.current += 1
    setBusy(true)
    setError(null)
    workerRef.current.postMessage(request)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setProgress(message.filesRead)
        setUploading(message.uploaded ?? null)
        return
      }
      // Replies arrive in request order; stay busy until the last outstanding one.
      pendingRef.current = Math.max(0, pendingRef.current - 1)
      if (pendingRef.current === 0) setBusy(false)
      setProgress(null)
      setUploading(null)
      if (message.type === 'state') setState(message.state)
      else setError(message.message)
    }
    worker.onerror = (event) => {
      pendingRef.current = 0
      setBusy(false)
      setProgress(null)
      setUploading(null)
      setError(event.message || 'The analysis worker failed')
    }
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
      pendingRef.current = 0
    }
  }, [])

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
    const before = previousStatusRef.current
    previousStatusRef.current = accountStatus
    if (accountStatus === 'signed-in' && before !== 'signed-in') {
      send({ type: 'loadServer', settings: settingsRef.current })
    } else if (accountStatus === 'signed-out' && before === 'signed-in') {
      send({ type: 'clear' })
    }
  }, [accountStatus, me, send])

  const addFiles = useCallback(
    (files: File[]) => {
      // File objects are cloned by reference, so the worker streams them without a copy here.
      if (files.length === 0) return
      const current = accountRef.current
      const sync =
        current.status === 'signed-in' && current.me !== null
          ? { keepFiles: current.me.profile.keepFiles }
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

  return { state, busy, progress, uploading, error, addFiles, loadSample, setRange, clear }
}

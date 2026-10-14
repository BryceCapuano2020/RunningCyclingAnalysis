import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionState } from '../core/session'
import type { AthleteSettings } from '../core/types'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'

export interface AnalysisController {
  state: SessionState
  busy: boolean
  /** Number of FIT files read so far during an import. */
  progress: number | null
  error: string | null
  addFiles: (files: File[]) => void
  loadSample: () => void
  setRange: (rangeDays: number | null) => void
  clear: () => void
}

const EMPTY: SessionState = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
  rangeDays: null,
}

export function useAnalysis(settings: AthleteSettings): AnalysisController {
  const workerRef = useRef<Worker | null>(null)
  const settingsRef = useRef(settings)
  const pendingRef = useRef(0)
  const [state, setState] = useState<SessionState>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<AnalysisController['progress']>(null)
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
        return
      }
      // Replies arrive in request order; stay busy until the last outstanding one.
      pendingRef.current = Math.max(0, pendingRef.current - 1)
      if (pendingRef.current === 0) setBusy(false)
      setProgress(null)
      if (message.type === 'state') setState(message.state)
      else setError(message.message)
    }
    worker.onerror = (event) => {
      pendingRef.current = 0
      setBusy(false)
      setProgress(null)
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

  const addFiles = useCallback(
    (files: File[]) => {
      // File objects are cloned by reference, so the worker streams them without a copy here.
      if (files.length > 0) send({ type: 'addFiles', files, settings: settingsRef.current })
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

  return { state, busy, progress, error, addFiles, loadSample, setRange, clear }
}

import { useCallback } from 'react'
import { STOPPED_BY_USER } from './copy'
import type { Box, SetError } from './model'

interface StopDeps {
  clearQueues: () => void
  setProgress: (progress: null) => void
  setUploading: (uploading: null) => void
  setImportOutcome: (outcome: null) => void
  setRebuildNotice: (notice: null) => void
  setWorkerStopped: (stopped: boolean) => void
  automaticRestartCountRef: Box<number>
  setError: SetError
  restartWorker: () => void
}

/**
 * A stop cancels the work in progress and keeps the result on screen. The worker is replaced, and its account pass reloads the
 * kept library, which replaces the result with what was saved.
 */
export function useStop({
  clearQueues,
  setProgress,
  setUploading,
  setImportOutcome,
  setRebuildNotice,
  setWorkerStopped,
  automaticRestartCountRef,
  setError,
  restartWorker,
}: StopDeps) {
  return useCallback(() => {
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
}

import { useEffect } from 'react'
import type { WorkerResponse } from '../../worker/protocol'
import { workerFailureText } from './copy'
import { handleReply } from './replyHandlers'
import type { WorkerEventDeps } from './replyHandlers'
import { isStaleDeviceList } from './staleReplies'
import { drainBatches, EMPTY_SESSION } from './model'
import { useLatest } from './useLatest'

/**
 * Creates the worker and routes its messages. Each reply is attributed to the request it answers,
 * and a message from an earlier worker generation is ignored. The effect runs once per generation:
 * its handlers read the latest callbacks through useLatest, so a callback that changes identity does
 * not replace the worker.
 */
export function useWorkerEvents(deps: WorkerEventDeps): void {
  const { workerGeneration } = deps.transport
  const latest = useLatest(deps)

  useEffect(() => {
    const generation = workerGeneration
    const { transport, previousStatusRef, previousUserIdRef } = latest()
    const { workerRef } = transport
    const worker = new Worker(new URL('../../worker/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      const message = event.data
      if (message.type === 'progress') {
        current.imports.setProgress({
          filesRead: message.filesRead,
          filesTotal: message.filesTotal ?? null,
          ...(message.paused ? { paused: true as const } : {}),
        })
        current.imports.setUploading(message.uploaded ?? null)
        // A new import has begun, so the last one's count no longer stands.
        current.imports.setSavedCount(null)
        return
      }
      if (message.type === 'missingOriginals') {
        current.library.setMissingOriginals(message.count)
        return
      }
      if (message.type === 'detailCoverage') {
        // Unknown when storage could not say, so no activity is called detail-less on an old answer.
        current.library.setDetail(
          message.ids === null
            ? null
            : { ids: new Set(message.ids), oldestStartMs: message.oldestStartMs },
        )
        return
      }
      if (message.type === 'libraryActivities') {
        if (isStaleDeviceList(current.transport, current.accountRef)) return
        // Also read at once by rememberKeptLibrary, ahead of the render that sets the state.
        current.library.savedActivitiesRef.current = message.activities
        current.library.setSavedActivities(message.activities)
        return
      }
      if (message.type === 'libraryUnreadable') {
        current.library.setLibraryUnreadable(message.count)
        return
      }
      if (message.type === 'deviceIssue') {
        current.library.setDeviceIssue(
          message.issue === 'notSaved'
            ? {
                issue: 'notSaved',
                count: message.count,
                ...(message.newer === undefined ? {} : { newer: message.newer }),
              }
            : { issue: 'notForgotten' },
        )
        return
      }
      if (message.type === 'accountIssue') {
        current.handleAccountIssue(message.issue)
        return
      }
      handleReply(current, message)
    }
    worker.onerror = (event) => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      handleWorkerError(current, worker, event)
    }
    workerRef.current = worker
    // A worker that starts while nobody is signed in begins from the library kept in this browser.
    // One that starts signed in never does, so the device library cannot replace an account's.
    const current = latest()
    current.deviceLoadedRef.current = false
    current.loadDeviceOnce()
    transport.flushUnsent()
    return () => {
      worker.terminate()
      workerRef.current = null
      transport.dropPendingReplies()
      // In React StrictMode, effects are cleaned up and set up again on mount. The first
      // worker is terminated, so its initial account-load request must be sent to the new one.
      previousStatusRef.current = 'loading'
      previousUserIdRef.current = null
    }
  }, [workerGeneration, latest])
}

/**
 * The worker stopped on its own. It is replaced once automatically. A second failure stops it for
 * good until the user asks for a retry, so a broken module or browser resource cannot trigger an
 * unbounded restart loop.
 */
function handleWorkerError(deps: WorkerEventDeps, worker: Worker, event: ErrorEvent): void {
  const { transport, imports, library, accountRef, setError, failLibrary, refreshBusy } = deps
  transport.dropPendingReplies()
  refreshBusy()
  imports.setProgress(null)
  imports.setUploading(null)
  const current = accountRef.current
  if (current.status !== 'signed-in') imports.setState(EMPTY_SESSION)
  imports.setImportOutcome(null)
  const willRestart = transport.automaticRestartCountRef.current < 1
  setError(workerFailureText(current.status, willRestart, event.message))
  if (willRestart) {
    transport.automaticRestartCountRef.current += 1
    transport.restartWorker()
  } else {
    worker.terminate()
    transport.workerRef.current = null
    transport.stoppedRef.current = true
    transport.setWorkerStopped(true)
    // A worker that stays down cannot restore the kept library, so the restoring state ends.
    library.setRestoring(false)
    // Imports waiting for a library the worker can no longer read are dropped, so the page is not busy.
    drainBatches(library.libraryWaitRef)
    refreshBusy()
    if (current.status === 'signed-in') failLibrary()
  }
}

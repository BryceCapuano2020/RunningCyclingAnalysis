import { useCallback } from 'react'
import type { WorkerRequest } from '../../worker/protocol'
import { drainBatches } from './model'
import type { Account, Box } from './model'
import { useStop } from './useStop'

interface QueueDeps {
  failManifest: () => void
  forgetManifest: (scope: 'device') => void
  dropPendingReplies: () => void
  dropUnsent: () => void
  provisionalImportsRef: Box<File[][]>
  libraryWaitRef: Box<File[][]>
  refreshBusy: () => void
  send: (request: WorkerRequest) => void
  accountRef: Box<Account>
  clearAll: () => void
  stopWith: Omit<Parameters<typeof useStop>[0], 'clearQueues'>
}

/**
 * The page's ways of emptying what is under way: `clearQueues` (every queue: the requests waiting for a worker, the requests the
 * worker still owes, the files analysed while the account loads, and the imports waiting for the library; a stop and an account change
 * both use it), `clearSession`, a stop that keeps the result on screen, and Remove all.
 */
export function useQueueControl({
  failManifest,
  forgetManifest,
  dropPendingReplies,
  dropUnsent,
  provisionalImportsRef,
  libraryWaitRef,
  refreshBusy,
  send,
  accountRef,
  clearAll,
  stopWith,
}: QueueDeps) {
  const clearQueues = useCallback(() => {
    // Whatever import was running is cut off: the library holds only part of it.
    failManifest()
    dropPendingReplies()
    dropUnsent()
    drainBatches(provisionalImportsRef)
    drainBatches(libraryWaitRef)
    refreshBusy()
  }, [
    dropPendingReplies,
    dropUnsent,
    failManifest,
    libraryWaitRef,
    provisionalImportsRef,
    refreshBusy,
  ])
  // A clear keeps the chosen period: the session holds it, so nothing else is sent.
  const clearSession = useCallback(() => send({ type: 'clear', forgetDevice: false }), [send])
  const stop = useStop({ clearQueues, ...stopWith })
  // Removing everything also forgets what was recorded about the library: nothing of it is left to be short of.
  const clear = useCallback(() => {
    failManifest()
    clearAll()
    if (accountRef.current.status !== 'signed-in') forgetManifest('device')
  }, [accountRef, clearAll, failManifest, forgetManifest])
  return { clearQueues, clearSession, stop, clear }
}

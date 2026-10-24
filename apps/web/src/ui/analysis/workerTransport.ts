import { useCallback, useRef, useState } from 'react'
import type { WorkerRequest } from '../../worker/protocol'
import { STOPPED } from './copy'
import type { Box, Pending, SetError, Setter } from './model'

/** A request made while there is no worker, with the settle its reply will go to. */
interface UnsentRequest {
  request: WorkerRequest
  settle?: Pending['settle']
}

/**
 * The worker, the requests sent to it, and which reply answers which request. A request made while
 * there is no worker waits in `unsentRef` for the next one. Replies arrive in request order, so the
 * front of `pendingRepliesRef` is the request the next reply answers.
 */
export interface WorkerTransport {
  workerRef: Box<Worker | null>
  workerGenerationRef: Box<number>
  workerGeneration: number
  stoppedRef: Box<boolean>
  unsentRef: Box<UnsentRequest[]>
  pendingRepliesRef: Box<Pending[]>
  automaticRestartCountRef: Box<number>
  workerStopped: boolean
  setWorkerStopped: Setter<boolean>
  send: (request: WorkerRequest, notice?: string, settle?: Pending['settle']) => void
  flushUnsent: () => void
  dropPendingReplies: () => void
  /** Forgets the requests waiting for a worker. A route request among them is answered as unread. */
  dropUnsent: () => void
  restartWorker: () => void
  retryWorker: () => void
}

interface TransportDeps {
  /** Owned by the page, which reads it to report what is busy. */
  pendingRepliesRef: Box<Pending[]>
  /** Runs once a request is pending and before it is posted, so the page can clear what it replaces. */
  onSend: (request: WorkerRequest) => void
  setError: SetError
}

export function useWorkerTransport({
  pendingRepliesRef,
  onSend,
  setError,
}: TransportDeps): WorkerTransport {
  const workerRef = useRef<Worker | null>(null)
  const workerGenerationRef = useRef(0)
  const [workerGeneration, setWorkerGeneration] = useState(0)
  // Set when the worker has stopped for good. Imports are refused, not queued, until a restart.
  const stoppedRef = useRef(false)
  const [workerStopped, setWorkerStopped] = useState(false)
  // Requests made while there is no worker (during a restart) wait here, in order.
  const unsentRef = useRef<UnsentRequest[]>([])
  const automaticRestartCountRef = useRef(0)

  const restartWorker = useCallback(() => {
    const next = workerGenerationRef.current + 1
    workerGenerationRef.current = next
    // A new worker runs nothing that was refused while the old one was stopped.
    stoppedRef.current = false
    setWorkerGeneration(next)
  }, [])

  /** Forgets the requests the worker still owes. Any export among them ends without a file. */
  const dropPendingReplies = useCallback(() => {
    const dropped = pendingRepliesRef.current
    pendingRepliesRef.current = []
    for (const pending of dropped) pending.settle?.(null)
  }, [pendingRepliesRef])

  /** Answers the route requests waiting for a worker as unread, and forgets the others. */
  const dropUnsent = useCallback(() => {
    const dropped = unsentRef.current
    unsentRef.current = []
    for (const { settle } of dropped) settle?.(null)
  }, [])

  const send = useCallback(
    (request: WorkerRequest, notice?: string, settle?: Pending['settle']) => {
      const worker = workerRef.current
      if (worker === null) {
        // Once the worker has stopped for good, nothing is queued for a later restart. A route is
        // answered as unread, without an error, so its page offers to try again. The user is told
        // to act again otherwise. Settings still queue: they must reach the next worker. A request
        // to forget the routes needs no worker, so it is dropped quietly.
        if (stoppedRef.current && request.type !== 'setSettings') {
          if (request.type === 'routeShape') settle?.(null)
          else if (request.type !== 'forgetRoutes') setError(STOPPED)
          return
        }
        unsentRef.current.push({ request, settle })
        return
      }
      pendingRepliesRef.current.push({ kind: request.type, notice, settle })
      onSend(request)
      worker.postMessage(request)
    },
    [onSend, pendingRepliesRef, setError],
  )

  const flushUnsent = useCallback(() => {
    for (const { request, settle } of unsentRef.current.splice(0)) send(request, undefined, settle)
  }, [send])

  const retryWorker = useCallback(() => {
    setWorkerStopped(false)
    automaticRestartCountRef.current = 0
    setError(null)
    restartWorker()
  }, [restartWorker, setError])

  return {
    workerRef,
    workerGenerationRef,
    workerGeneration,
    stoppedRef,
    unsentRef,
    pendingRepliesRef,
    automaticRestartCountRef,
    workerStopped,
    setWorkerStopped,
    send,
    flushUnsent,
    dropPendingReplies,
    dropUnsent,
    restartWorker,
    retryWorker,
  }
}

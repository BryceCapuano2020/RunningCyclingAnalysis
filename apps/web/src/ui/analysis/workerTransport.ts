import { useCallback, useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { WorkerRequest } from '../../worker/protocol'
import { NOT_SENT, STOPPED } from './copy'
import type { Box, Pending, SetError, Setter } from './model'

/** What a reply needs besides its request: its settle, its baseline and the session it was made in. */
type PendingEntry = Omit<Pending, 'kind' | 'id' | 'sentAt'>

/** A request made while there is no worker, with what its reply needs. */
interface UnsentRequest {
  request: WorkerRequest
  entry: PendingEntry
}

/**
 * The worker, the requests sent to it, and which reply answers which request. A request made while
 * there is no worker waits in `unsentRef` for the next one. Each request sent to a worker is numbered
 * (`Pending.id`) and the worker echoes the number on its reply, so a reply is matched by number and a
 * reply that matches nothing is stray. `pendingRepliesRef` keeps the requests in the order they were sent.
 */
export interface WorkerTransport {
  workerRef: Box<Worker | null>
  workerGenerationRef: Box<number>
  workerGeneration: number
  stoppedRef: Box<boolean>
  unsentRef: Box<UnsentRequest[]>
  pendingRepliesRef: Box<Pending[]>
  /** Messages from the worker that answered no request still waiting (late, repeated or unknown). */
  strayRepliesRef: Box<number>
  /** When the worker last said anything at all, in epoch ms: any message of the current generation. */
  lastHeardAtRef: Box<number>
  /** Reads the watchdog let go that the worker may still be running, with the last work count it reported. */
  releasedRef: Box<Map<number, { progress: number | undefined }>>
  automaticRestartCountRef: Box<number>
  /**
   * Counts each Start over. A library read made in an earlier session is overtaken: its answer is
   * not shown, since the clear that followed it has emptied the page.
   */
  sessionEpochRef: Box<number>
  workerStopped: boolean
  setWorkerStopped: Setter<boolean>
  /** Returns false when the request was refused, because the worker has stopped for good. */
  send: (
    request: WorkerRequest,
    notice?: string,
    settle?: Pending['settle'],
    baseline?: AnalysisResult | null,
  ) => boolean
  flushUnsent: () => void
  /**
   * Forgets the analysis of files added while the account loaded: one still queued is not sent, and
   * one still running is not shown when it answers.
   */
  dropProvisional: () => void
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
  /** Runs when a request leaves the pending list without a reply, so the page can recount what is busy. */
  onDropped: () => void
  setError: SetError
}

/**
 * Marks the analyses of files added while the account loads as ignored, in place: other code holds
 * these entries (a settle closure, the watchdog), and a copy would leave them looking at a request
 * that is no longer the one in the list.
 */
function ignoreProvisional(waiting: readonly Pending[]): void {
  for (const pending of waiting) if (pending.provisional) pending.ignored = true
}

export function useWorkerTransport({
  pendingRepliesRef,
  onSend,
  onDropped,
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
  const sessionEpochRef = useRef(0)
  const nextRequestIdRef = useRef(0)
  const strayRepliesRef = useRef(0)
  const lastHeardAtRef = useRef(0)
  const releasedRef = useRef(new Map<number, { progress: number | undefined }>())

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
    for (const { entry } of dropped) entry.settle?.(null)
  }, [])

  /** Sends a request now, or queues it while there is no worker. `entry` is what its reply needs. */
  const dispatch = useCallback(
    (request: WorkerRequest, entry: PendingEntry): boolean => {
      const worker = workerRef.current
      if (worker === null) {
        // Once the worker has stopped for good, nothing is queued for a later restart. A route is
        // answered as unread, without an error, so its page offers to try again. The user is told
        // to act again otherwise. Settings still queue: they must reach the next worker. A request
        // to forget the routes needs no worker, so it is dropped quietly.
        if (stoppedRef.current && request.type !== 'setSettings') {
          // A period pick is answered with no reply, so the control stops waiting for it.
          if (
            request.type === 'routeShape' ||
            request.type === 'activityTrace' ||
            request.type === 'setRange'
          )
            entry.settle?.(null)
          if (
            request.type !== 'routeShape' &&
            request.type !== 'activityTrace' &&
            request.type !== 'forgetRoutes'
          )
            setError(STOPPED)
          return false
        }
        unsentRef.current.push({ request, entry })
        return true
      }
      const flags =
        request.type === 'addFiles'
          ? {
              provisional: request.provisional === true,
              saveToDevice: request.saveToDevice === true,
            }
          : request.type === 'clear'
            ? { forgetDevice: request.forgetDevice === true }
            : request.type === 'routeShape' || request.type === 'activityTrace'
              ? { fromOriginal: request.fromOriginal === true }
              : {}
      // The number is taken here, when the request goes to a worker, so one that waited for a restart
      // is numbered for the worker that runs it.
      const pending: Pending = {
        id: ++nextRequestIdRef.current,
        kind: request.type,
        sentAt: Date.now(),
        ...entry,
        ...flags,
      }
      pendingRepliesRef.current.push(pending)
      onSend(request)
      try {
        worker.postMessage({ ...request, requestId: pending.id })
      } catch {
        // The browser could not copy the request to the worker (a file that cannot be cloned). The
        // worker never saw it, so nothing will answer: settle it here and say so.
        pendingRepliesRef.current = pendingRepliesRef.current.filter((other) => other !== pending)
        pending.settle?.(null)
        onDropped()
        setError(NOT_SENT)
        return false
      }
      return true
    },
    [onDropped, onSend, pendingRepliesRef, setError],
  )

  // A request is stamped with the session it is made in, when it is made, even if it waits for a worker.
  const send = useCallback(
    (
      request: WorkerRequest,
      notice?: string,
      settle?: Pending['settle'],
      baseline?: AnalysisResult | null,
    ): boolean => dispatch(request, { notice, settle, baseline, session: sessionEpochRef.current }),
    [dispatch],
  )

  const flushUnsent = useCallback(() => {
    for (const { request, entry } of unsentRef.current.splice(0)) dispatch(request, entry)
  }, [dispatch])

  const dropProvisional = useCallback(() => {
    unsentRef.current = unsentRef.current.filter(
      ({ request }) => !(request.type === 'addFiles' && request.provisional === true),
    )
    ignoreProvisional(pendingRepliesRef.current)
  }, [pendingRepliesRef, unsentRef])

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
    strayRepliesRef,
    lastHeardAtRef,
    releasedRef,
    automaticRestartCountRef,
    sessionEpochRef,
    workerStopped,
    setWorkerStopped,
    send,
    flushUnsent,
    dropProvisional,
    dropPendingReplies,
    dropUnsent,
    restartWorker,
    retryWorker,
  }
}

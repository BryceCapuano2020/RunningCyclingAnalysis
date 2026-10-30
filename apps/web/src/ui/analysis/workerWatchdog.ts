import { useEffect, useRef } from 'react'
import { resetActivity, stallOf } from './requestWatch'
import { useLatest } from './useLatest'
import { failStalledWorker } from './workerEvents'
import type { WorkerEventDeps } from './replyHandlers'

/** How often the page looks at the request the worker is running. */
export const WATCHDOG_MS = 5_000

/** A tick this many intervals late means the page was asleep, not that the worker was silent. */
const SLEEP_TICKS = 3

/** The most let-go reads remembered; older ones are forgotten. */
const RELEASED_KEPT = 20

function rememberReleased(
  released: Map<number, { progress: number | undefined }>,
  id: number,
  progress: number | undefined,
): void {
  released.set(id, { progress })
  for (const old of released.keys()) {
    if (released.size <= RELEASED_KEPT) break
    released.delete(old)
  }
}

interface WatchdogDeps {
  events: WorkerEventDeps
  /** Says the work is slow, unless an error is already showing. Safe to call on every tick. */
  showStillWorking: () => void
  /** Takes back the "still working" notice, and only that notice. Safe to call on every tick. */
  clearStillWorking: () => void
}

/**
 * Watches the request the worker is running. With no headway for a while it says so (a neutral notice,
 * not a fault); a long stall replaces the worker; a stalled single read is let go and the worker is left
 * alone. Headway is a message from the worker about that request that carries news: a reply, a progress
 * message, or a heartbeat whose work count moved. Time the page itself lost (a suspended laptop, a
 * frozen or throttled tab) is not silence: a tick that comes long after it was due starts every wait
 * again. Nothing else resets a wait, so switching tabs cannot hide a hung worker.
 */
export function useWorkerWatchdog(deps: WatchdogDeps): void {
  const latest = useLatest(deps)
  const lastTickAt = useRef(0)

  useEffect(() => {
    lastTickAt.current = Date.now()
    const forgetLostTime = () => {
      const now = Date.now()
      lastTickAt.current = now
      const { transport } = latest().events
      resetActivity(transport.pendingRepliesRef.current, now)
      transport.lastHeardAtRef.current = now
    }
    const timer = setInterval(() => {
      const now = Date.now()
      const lost = now - lastTickAt.current > SLEEP_TICKS * WATCHDOG_MS
      if (lost) {
        forgetLostTime()
        return
      }
      lastTickAt.current = now
      const { events, showStillWorking, clearStillWorking } = latest()
      const { transport } = events
      const found = stallOf(
        transport.pendingRepliesRef.current,
        now,
        transport.lastHeardAtRef.current,
      )
      if (found === null || found.stall === 'ok') {
        clearStillWorking()
      } else if (found.stall === 'slow') {
        showStillWorking()
      } else if (found.stall === 'release') {
        const waiting = transport.pendingRepliesRef.current
        waiting.splice(waiting.indexOf(found.pending), 1)
        rememberReleased(transport.releasedRef.current, found.pending.id, found.pending.progress)
        found.pending.settle?.(null)
        events.refreshBusy()
      } else {
        clearStillWorking()
        failStalledWorker(events)
      }
    }, WATCHDOG_MS)
    return () => {
      clearInterval(timer)
    }
  }, [latest])
}

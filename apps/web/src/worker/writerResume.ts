import { asWriter } from './updaterLock'
import type { WriterLocks } from './updaterLock'

/** A resume as the worker holds it: it can be cancelled, and it can be waited for. */
export interface Writing {
  cancel: () => void
  finished: Promise<unknown>
}

/**
 * A resume that runs only in the tab that holds the account's writer lock (see asWriter), so two tabs open on the
 * account never send the same rows at once. A tab that does not hold it does nothing, and its rows are the writer's
 * to finish. It can be cancelled before it has the lock and after.
 */
export function resumeAsWriter(userId: string, start: () => Writing, locks?: WriterLocks): Writing {
  let cancelled = false
  let running: Writing | null = null
  const finished = asWriter(
    userId,
    async () => {
      if (cancelled) return
      running = start()
      await running.finished
    },
    locks,
  ).then(() => undefined)
  return {
    cancel: () => {
      cancelled = true
      running?.cancel()
    },
    finished,
  }
}

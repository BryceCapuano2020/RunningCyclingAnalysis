import { keptLibraryHinted } from './keptLibrary'

/**
 * Whether the analysis worker starts with the page. A browser that kept results starts it at once, so
 * the restoring page can end as soon as the library replies. Any other visit starts it when the browser
 * is idle (see whenIdle), or sooner if a request needs it.
 */
export function workerStartsWithPage(): boolean {
  return keptLibraryHinted()
}

/** How long a first visit waits for the browser to be idle before it starts the worker anyway. */
export const IDLE_START_MS = 1500

/**
 * Runs `start` when the browser is idle, or after IDLE_START_MS where it has no idle callback. Returns
 * the cancel. A first visit starts the worker this way, so the kept library of a browser whose hint is
 * missing still restores, while the page's own scripts and styles load first.
 */
export function whenIdle(start: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(start, { timeout: IDLE_START_MS })
    return () => cancelIdleCallback(id)
  }
  const timer = setTimeout(start, IDLE_START_MS)
  return () => clearTimeout(timer)
}

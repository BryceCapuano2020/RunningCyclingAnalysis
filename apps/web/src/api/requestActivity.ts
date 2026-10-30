let observer: (() => void) | undefined

/** Registers who hears of each bit of headway a request makes (the worker's watchdog counter). */
export function observeRequests(next: () => void): void {
  observer = next
}

/** A request made headway: an answer arrived, or another chunk of a body did. */
export function noteRequestActivity(): void {
  observer?.()
}

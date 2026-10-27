/** The gap between two progress messages: about four a second, enough for a count the eye can follow. */
export const PROGRESS_INTERVAL_MS = 250

export interface Throttled<T> {
  /**
   * Sends the value if the interval has passed since the last one, or if `immediate` is set.
   * Otherwise only the latest value is kept, and sent when the interval ends.
   */
  report(value: T, immediate?: boolean): void
  /** Sends the value that is waiting, if any, now. */
  flush(): void
}

/** Limits how often `send` is called, always ending with the latest value reported. */
export function throttled<T>(
  send: (value: T) => void,
  clock: () => number = () => performance.now(),
): Throttled<T> {
  let lastSentAt = -Infinity
  let waiting: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
    waiting = null
  }
  const emit = (value: T) => {
    cancel()
    lastSentAt = clock()
    send(value)
  }
  const flush = () => {
    if (waiting !== null) emit(waiting.value)
  }
  const report = (value: T, immediate = false) => {
    const sinceLast = clock() - lastSentAt
    if (immediate || sinceLast >= PROGRESS_INTERVAL_MS) {
      emit(value)
      return
    }
    waiting = { value }
    timer ??= setTimeout(flush, PROGRESS_INTERVAL_MS - sinceLast)
  }
  return { report, flush }
}

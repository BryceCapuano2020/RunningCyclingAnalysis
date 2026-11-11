/**
 * One compute at a time in an isolate, shared by the route and the queue consumer: `max_concurrency = 1` limits
 * consumers, not isolates, and a compute holds the isolate's memory (a library's digests) and its event loop. A caller
 * that finds it taken does not wait: the route serves what is stored or says it is computing, and the consumer retries.
 */
let busy = false

/** Runs `work` if no compute is under way in this isolate, and says so; otherwise runs nothing. */
export async function withComputeLock<T>(
  work: () => Promise<T>,
): Promise<{ ran: true; value: T } | { ran: false }> {
  if (busy) return { ran: false }
  busy = true
  try {
    return { ran: true, value: await work() }
  } finally {
    busy = false
  }
}

/** A result this isolate computed and did not store (the stored snapshot is a later Worker's), ready to serve again. */
export interface UnstoredResult {
  hash: string
  json: string
  nowMs: number
  version: number
}

const UNSTORED_MAX = 8
const unstored = new Map<string, UnstoredResult>()

/** The key of a result: it is the same answer while none of these moves. */
export const unstoredKey = (userId: string, version: number, liftRevision: number, day: number) =>
  `${userId}:${version}:${liftRevision}:${day}`

export const unstoredFor = (key: string): UnstoredResult | undefined => unstored.get(key)

/** Keeps a result for the next read, the oldest going first so the isolate holds a few at most. */
export function keepUnstored(key: string, result: UnstoredResult): void {
  unstored.delete(key)
  unstored.set(key, result)
  for (const oldest of unstored.keys()) {
    if (unstored.size <= UNSTORED_MAX) break
    unstored.delete(oldest)
  }
}

/** Forgets every kept result: the account is gone, or a test starts clean. */
export const forgetUnstored = (): void => unstored.clear()

/** Forgets what is kept for one account: it was deleted, and its results do not outlive it in an isolate. */
export function forgetUnstoredFor(userId: string): void {
  for (const key of [...unstored.keys()]) if (key.startsWith(`${userId}:`)) unstored.delete(key)
}

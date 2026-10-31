import { WRITER_LOCK_PREFIX } from './updaterConfig'

/** The part of the browser's lock manager the writer election uses. */
export interface WriterLocks {
  request<T>(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<T>,
  ): Promise<T>
}

/** The name of the lock the one writing tab of an account holds. */
export function writerLockName(userId: string): string {
  return `${WRITER_LOCK_PREFIX}${userId}`
}

/**
 * Runs `run` only in the tab that holds this account's writer lock, which it takes if it is free and
 * holds until `run` ends. Another tab holding it (updating, or later flushing saves) means this one does
 * not write: the answer says so and `run` is not called, so two tabs never rebuild or send at once.
 * Where the browser has no locks, or refuses to take one, the tab writes, as a lone tab would.
 */
export async function asWriter<T>(
  userId: string,
  run: () => Promise<T>,
  locks: WriterLocks | undefined = globalThis.navigator?.locks as WriterLocks | undefined,
): Promise<{ writer: true; value: T } | { writer: false }> {
  if (locks === undefined) return { writer: true, value: await run() }
  let started = false
  try {
    return await locks.request(writerLockName(userId), { ifAvailable: true }, async (lock) => {
      if (lock === null) return { writer: false as const }
      started = true
      return { writer: true as const, value: await run() }
    })
  } catch (error) {
    // The browser refused the lock itself; an error from `run` is the run's own, and goes on.
    if (started) throw error
    return { writer: true, value: await run() }
  }
}

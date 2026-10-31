import { stopsSaving, SyncFailure } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { ApiRequestError } from '../api/client'
import { syncIssueFor } from './syncIssue'
import { noteWork } from './workerWire'

/** The edge rate limiter's window, and the Retry-After its 429 carries. */
export const RATE_LIMIT_WINDOW_MS = 60_000

/** The wait for a full upload slot when the server did not say how long: its Retry-After is five seconds. */
const UPLOAD_SLOT_WAIT_MS = 5_000

/** The longest an import waits for a rate limit. A longer Retry-After stops the import instead. */
const MAX_WAIT_MS = 2 * RATE_LIMIT_WINDOW_MS

/** How often a long wait reports that it is alive, so a watchdog does not take it for a stall. */
const WAIT_STEP_MS = 10_000

export async function waitNoting(ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= WAIT_STEP_MS) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(left, WAIT_STEP_MS)))
    noteWork()
  }
}

/** How long a refused save waits before its one more try, or null when it is not a rate limit or the wait is too long. */
function rateLimitWaitMs(error: unknown): number | null {
  if (syncIssueFor(error) !== 'rate-limited') return null
  const waitMs =
    (error instanceof ApiRequestError ? error.retryAfterMs : undefined) ?? RATE_LIMIT_WINDOW_MS
  return waitMs > MAX_WAIT_MS ? null : waitMs
}

/**
 * What the saves of one import share when one of them is refused. A failure that stops saving (a rate limit that
 * holds, a full library, a signed-out account) is remembered, so saves still in the queue fail at once with the same
 * cause instead of each asking the server again. A rate limit is waited out by one save only: the first to meet it
 * waits for the Retry-After and tries again, and the saves that meet it meanwhile, or start meanwhile, wait for how
 * that try ends.
 */
export class SaveStop {
  private code: SyncIssueCode | null = null
  private leader: Promise<void> | null = null
  private readonly onStopped: (code: SyncIssueCode) => void

  /** `onStopped` hears of the first failure that stops saving, once. */
  constructor(onStopped: (code: SyncIssueCode) => void) {
    this.onStopped = onStopped
  }

  /** Throws the failure that stopped the saves, if one did. */
  check(): void {
    if (this.code !== null) throw new SyncFailure(this.code, 'Saving stopped by an earlier failure')
  }

  /** Notes a failure that stops saving; only the first is reported. Other failures are left alone. */
  noteFailure(code: SyncIssueCode): void {
    if (this.code !== null || !stopsSaving(code)) return
    this.code = code
    this.onStopped(code)
  }

  /** Waits while a rate limit is being waited out, then throws if the saves have stopped. */
  async ready(): Promise<void> {
    while (this.leader !== null) await this.leader
    this.check()
  }

  /**
   * Runs one save. When the server answers 429, it waits for the Retry-After that came with it and tries the same
   * save once more: a create is idempotent, so the second try cannot duplicate it. A second refusal, or any other
   * failure, is thrown as it is. `attempt` is told whether it is the try that leads the others. `onWait` is called
   * just before the wait, so the page can say why nothing is moving.
   */
  async run<T>(attempt: (leading: boolean) => Promise<T>, onWait?: () => void): Promise<T> {
    this.check()
    try {
      return await attempt(false)
    } catch (error) {
      const waitMs = rateLimitWaitMs(error)
      if (waitMs === null) throw error
      this.check()
      if (this.leader !== null) {
        // Another save is already waiting this limit out. Its try decides whether this one goes on.
        await this.ready()
        return await attempt(false)
      }
      let end: () => void = () => undefined
      this.leader = new Promise<void>((resolve) => (end = resolve))
      try {
        onWait?.()
        await waitNoting(waitMs)
        return await attempt(true)
      } catch (retryError) {
        // Recorded before the others wake, so they find the saves stopped.
        this.noteFailure(syncIssueFor(retryError))
        throw retryError
      } finally {
        this.leader = null
        end()
      }
    }
  }
}

/**
 * Runs one upload. When the server says the account's upload slots are full (429 upload_in_progress), it waits for
 * the Retry-After and tries once more: two uploads at once fill both slots, and a slot left by a worker that was
 * killed stays held until its lease runs out.
 */
export async function retryAfterUploadSlot<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    if (syncIssueFor(error) !== 'upload-in-progress') throw error
    const waitMs =
      (error instanceof ApiRequestError ? error.retryAfterMs : undefined) ?? UPLOAD_SLOT_WAIT_MS
    if (waitMs > MAX_WAIT_MS) throw error
    await waitNoting(waitMs)
    return attempt()
  }
}

import type { ActivityRecord } from '@rca/contract'
import { isTransient, stopsSaving } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { uploadFile } from '../api/client'
import { workoutKeyOf } from './device'
import { DEFER_BYTES } from './deferredOriginals'
import { shownCount } from './hiddenCopies'
import type { WorkerResponse } from './protocol'
import { retryAfterUploadSlot } from './rateLimitRetry'
import { Gate, UPLOAD_CONCURRENCY } from './saveLimits'
import { syncFailureOf } from './syncIssue'

interface Waiting {
  userId: string
  digestId: string
  record: ActivityRecord
  bytes: Uint8Array
}

/**
 * The originals whose upload failed for a reason that passes (the connection, a server error) while the activity
 * itself was saved. The summary is not in the outbox any more, so these are the one thing "Try again now" and the
 * automatic resend would otherwise have nothing to send. They are held in the worker's memory only, up to a byte
 * budget; a reload drops them, and the library then lists the activity as missing its original (add the file again).
 */
export class FailedOriginals {
  private readonly waiting = new Map<string, Waiting>()
  private heldBytes = 0
  private readonly budget: number

  constructor(budgetBytes = DEFER_BYTES) {
    this.budget = budgetBytes
  }

  /** How many originals wait for a retry. */
  get size(): number {
    return this.waiting.size
  }

  /**
   * Holds the original to send again. False when the failure does not pass by itself, or the budget is spent: the
   * athlete is then told to add the file again.
   */
  keep(userId: string, record: ActivityRecord, bytes: Uint8Array, code: SyncIssueCode): boolean {
    if (!isTransient(code)) return false
    const key = workoutKeyOf(record.digest)
    this.drop(key)
    if (this.heldBytes + bytes.byteLength > this.budget) return false
    this.waiting.set(key, { userId, digestId: record.digest.id, record, bytes })
    this.heldBytes += bytes.byteLength
    return true
  }

  /** The workout's original is stored, or is no longer wanted: it is not sent again. */
  drop(key: string): void {
    const held = this.waiting.get(key)
    if (held === undefined) return
    this.heldBytes -= held.bytes.byteLength
    this.waiting.delete(key)
  }

  /** Nothing is held: the library or the account it belongs to is gone. */
  forget(): void {
    this.waiting.clear()
    this.heldBytes = 0
  }

  /** What waits for the account; what waits for another is let go. */
  private take(userId: string): [string, Waiting][] {
    for (const [key, held] of this.waiting) if (held.userId !== userId) this.drop(key)
    return [...this.waiting]
  }

  /**
   * Uploads each held original again. One that is stored, or whose copy the analysis now hides, is let go; one that
   * fails again stays for the next try. Says which keys are settled, for the caller to take off its unsaved list.
   */
  async retry(ctx: RetryContext): Promise<string[]> {
    const settled: string[] = []
    const gate = new Gate(UPLOAD_CONCURRENCY)
    const hidden = ctx.hiddenIds()
    let stopped = false
    await Promise.all(
      this.take(ctx.userId).map(([key, held]) =>
        gate.run(async () => {
          if (stopped || ctx.cancelled()) return
          // The activity was deleted since: there is nothing to attach the file to.
          if (!ctx.savedRecords.has(held.record.id)) {
            this.drop(key)
            settled.push(key)
            return
          }
          if (hidden.has(held.digestId)) {
            this.drop(key)
            settled.push(key)
            return
          }
          try {
            const saved = await retryAfterUploadSlot(() =>
              uploadFile(held.record.id, held.bytes, ctx.userId),
            )
            ctx.savedRecords.set(saved.id, saved)
            ctx.missingOriginals.delete(key)
            this.drop(key)
            settled.push(key)
          } catch (error) {
            // It stays held for the next try. A limit or an ended session would refuse the rest the same way.
            if (stopsSaving(syncFailureOf(error).code)) stopped = true
          }
        }),
      ),
    )
    if (settled.length > 0)
      ctx.post({
        type: 'missingOriginals',
        count: shownCount(ctx.missingOriginals, ctx.savedRecords.values()),
      })
    return settled
  }
}

export interface RetryContext {
  userId: string
  savedRecords: Map<string, ActivityRecord>
  missingOriginals: Set<string>
  /** The ids of the digests the analysis hides as the library stands. */
  hiddenIds: () => ReadonlySet<string>
  /** True once the resume was stopped; nothing more is sent. */
  cancelled: () => boolean
  /** Posts a message that answers no request. */
  post: (message: WorkerResponse) => void
}

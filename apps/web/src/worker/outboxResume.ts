import type { ActivityRecord } from '@rca/contract'
import { stopsSaving } from '@rca/core/session'
import { createActivity } from '../api/client'
import { workoutKeyOf } from './device'
import { digestOf } from './outbox'
import type { Outbox } from './outbox'
import type { WorkerResponse } from './protocol'
import { retryAfterRateLimit } from './rateLimitRetry'
import { Gate, SAVE_CONCURRENCY } from './saveLimits'
import { syncFailureOf } from './syncIssue'
import { noteWork } from './workerWire'

/** Failures after which a row is let go: the server holds another copy, or the account is going. */
const NEVER_TAKEN = new Set(['activity-conflict', 'account-deleting'])

export interface ResumeContext {
  userId: string
  outbox: Outbox
  /** The account's saved activities, as the library load read them; saved ones are added. */
  savedRecords: Map<string, ActivityRecord>
  /** Posts a message that answers no request (it is not stamped with one). */
  post: (message: WorkerResponse) => void
}

export interface Resume {
  /** Stops sending: the account, the library or the worker changed. Rows stay for the next load. */
  cancel: () => void
  finished: Promise<void>
}

/**
 * Finishes what an earlier visit began to save and did not: after the account's library has loaded, each row
 * the outbox still holds whose workout the server does not have is created, side by side as an import does,
 * and removed once the server has it. It runs apart from the requests the worker answers, so the page works
 * while it does, and it tells the page how it is going and how it ended. A row that keeps failing is let go
 * after a few tries, and the athlete is told how many could not be saved, to add those files again.
 */
export function resumeOutbox(ctx: ResumeContext): Resume {
  let cancelled = false
  const finished = (async () => {
    const rows = await ctx.outbox.pending()
    if (rows.length === 0 || cancelled) return
    const held = new Set([...ctx.savedRecords.values()].map(({ digest }) => workoutKeyOf(digest)))
    ctx.post({ type: 'outbox', pending: rows.length, saved: 0, failed: 0, finished: false })
    const gate = new Gate(SAVE_CONCURRENCY)
    let saved = 0
    let failed = 0
    let left = rows.length
    await Promise.all(
      rows.map((row) =>
        gate.run(async () => {
          if (cancelled) return
          noteWork()
          const digest = digestOf(row)
          if (digest === null) {
            // A summary this version cannot read: nothing to send, and nothing a retry would change.
            await ctx.outbox.done(row.key)
            failed++
          } else if (held.has(row.key)) {
            // The server has it already, from the import that was cut off or from a retry.
            await ctx.outbox.done(row.key)
          } else {
            try {
              const { record } = await retryAfterRateLimit(() =>
                createActivity(digest, row.fileName, row.fileHash, ctx.userId),
              )
              ctx.savedRecords.set(record.id, record)
              await ctx.outbox.done(row.key)
              saved++
            } catch (error) {
              const failure = syncFailureOf(error)
              if (NEVER_TAKEN.has(failure.code)) await ctx.outbox.done(row.key)
              else await ctx.outbox.failed(row.key)
              failed++
              // A limit or an ended session would refuse the rest the same way: they stay for another day.
              if (stopsSaving(failure.code)) cancelled = true
            }
          }
          left--
          if (!cancelled) {
            ctx.post({ type: 'outbox', pending: left, saved, failed, finished: false })
          }
        }),
      ),
    )
    ctx.post({ type: 'outbox', pending: cancelled ? left : 0, saved, failed, finished: true })
  })()
  return {
    cancel: () => {
      cancelled = true
    },
    finished,
  }
}

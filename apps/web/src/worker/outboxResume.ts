import type { ActivityRecord } from '@rca/contract'
import { revisionStatus } from '@rca/core/digest/revisions'
import { stopsSaving } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { createActivity } from '../api/client'
import { workoutKeyOf } from './device'
import { digestOf } from './outbox'
import type { Outbox, OutboxRow } from './outbox'
import type { WorkerResponse } from './protocol'
import { SaveStop } from './rateLimitRetry'
import type { SendingKeys } from './sendingKeys'
import { Gate, SAVE_CONCURRENCY } from './saveLimits'
import { syncFailureOf } from './syncIssue'
import { noteWork } from './workerWire'

/** Failures after which a row is let go at once: the server holds another copy, or the account is going. */
const NEVER_TAKEN = new Set<SyncIssueCode>(['activity-conflict', 'account-deleting'])

/** Thrown in place of a send that was cancelled while it waited: the row is left as it is. */
class NotSent extends Error {}

export interface ResumeContext {
  userId: string
  outbox: Outbox
  /** The account's saved activities, as the library load read them; saved ones are added. */
  savedRecords: Map<string, ActivityRecord>
  /** The workouts an import is sending; a row of one of them is left to that import. */
  sending: SendingKeys
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
 * while it does, and it tells the page how it is going and how it ended.
 *
 * Only a refusal counts against a row: after a few the athlete is told it could not be saved, to add its file
 * again. A stop (a limit, a signed-out account), a lost connection, a row an import is sending or one a newer
 * version wrote leaves the row as it is for another day. A row from an older analysis is let go unsent, since the
 * server would refuse it.
 */
export function resumeOutbox(ctx: ResumeContext): Resume {
  let cancelled = false
  const finished = (async () => {
    const rows = await ctx.outbox.pending()
    if (rows.length === 0 || cancelled) return
    const held = new Set([...ctx.savedRecords.values()].map(({ digest }) => workoutKeyOf(digest)))
    ctx.post({ type: 'outbox', pending: rows.length, saved: 0, failed: 0, finished: false })
    const gate = new Gate(SAVE_CONCURRENCY)
    // A limit or an ended session would refuse the rest the same way: one save waits it out, the rest do not ask.
    const stop = new SaveStop(() => {
      cancelled = true
    })
    let saved = 0
    let failed = 0
    // Rows still in the outbox when this ends.
    let kept = 0
    let left = rows.length
    /** What became of the row: saved, held already (nothing to say), let go for good, or kept for another day. */
    const resumeRow = async (row: OutboxRow): Promise<'saved' | 'held' | 'let-go' | 'kept'> => {
      const digest = digestOf(row)
      if (digest === null) {
        // A summary this version cannot read: nothing to send, and nothing a retry would change.
        await ctx.outbox.done(row.key, row.digestId)
        return 'let-go'
      }
      const revision = revisionStatus(digest.modelRevision)
      // A newer version of the app wrote it: it is left alone, as the kept library leaves such a row.
      if (revision === 'newer') return 'kept'
      // Only a digest the server would refuse is let go; one it reads beside the current model (compatible) is sent.
      if (revision === 'stale') {
        await ctx.outbox.done(row.key, row.digestId)
        return 'let-go'
      }
      if (held.has(row.key)) {
        // The server has it already, from the import that was cut off or from a retry.
        await ctx.outbox.done(row.key, row.digestId)
        return 'held'
      }
      // An import is sending this workout (its file was added again): it settles the row.
      if (ctx.sending.has(row.key)) return 'kept'
      try {
        const { record } = await stop.run(async (leading) => {
          if (!leading) await stop.ready()
          // Checked again after any wait (a rate limit's, another send's) and at the moment of sending: a cancel
          // or a stop that came meanwhile means nothing more is sent.
          return ctx.sending.run(row.key, () => {
            if (cancelled) throw new NotSent()
            return createActivity(digest, row.fileName, row.fileHash, ctx.userId)
          })
        })
        ctx.savedRecords.set(record.id, record)
        await ctx.outbox.done(row.key, row.digestId)
        return 'saved'
      } catch (error) {
        if (error instanceof NotSent) return 'kept'
        const failure = syncFailureOf(error)
        stop.noteFailure(failure.code)
        if (NEVER_TAKEN.has(failure.code)) {
          await ctx.outbox.done(row.key, row.digestId)
          return 'let-go'
        }
        // Not the server's refusal of this activity: a limit, an ended session or no connection says nothing about it.
        if (stopsSaving(failure.code) || failure.code === 'network') return 'kept'
        return (await ctx.outbox.failed(row.key, row.digestId)) ? 'let-go' : 'kept'
      }
    }
    await Promise.all(
      rows.map((row) =>
        gate.run(async () => {
          if (cancelled) {
            kept++
            return
          }
          noteWork()
          const outcome = await resumeRow(row)
          if (outcome === 'saved') saved++
          else if (outcome === 'let-go') failed++
          else if (outcome === 'kept') kept++
          left--
          if (!cancelled) {
            ctx.post({ type: 'outbox', pending: left, saved, failed, finished: false })
          }
        }),
      ),
    )
    ctx.post({ type: 'outbox', pending: kept, saved, failed, finished: true })
  })()
  return {
    cancel: () => {
      cancelled = true
    },
    finished,
  }
}

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

/**
 * How a row's save ended: the server has it now, had it already, holds another file for it, was let go, waits, or is
 * from an older analysis and waits for its file (`stale`: it stays in the outbox, unsent).
 */
export type RowOutcome = 'saved' | 'held' | 'conflict' | 'let-go' | 'kept' | 'stale'

/** What a resume came to. `stopped` is why it gave up on the rest, when it did. */
export interface ResumeResult {
  saved: number
  /**
   * Rows that could not be saved: refused too often, unreadable or taken by another file (these are let go for good),
   * or from an older analysis (these stay in the outbox until their file is added again).
   */
  failed: number
  /** Of those, the ones the server holds another copy of (same second, different file). */
  conflicts: number
  /** Rows still in the outbox when it ended. */
  kept: number
  stopped: SyncIssueCode | null
}

/** Thrown in place of a send that was cancelled while it waited: the row is left as it is. */
class NotSent extends Error {}

/** Thrown in place of a send whose row no longer stands (`allowed` said so at the moment of sending). */
class NoLongerAllowed extends Error {}

export interface ResumeContext {
  userId: string
  outbox: Outbox
  /** The account's saved activities, as the library load read them; saved ones are added. */
  savedRecords: Map<string, ActivityRecord>
  /** The workouts an import is sending; a row of one of them is left to that import. */
  sending: SendingKeys
  /** Posts a message that answers no request (it is not stamped with one). */
  post: (message: WorkerResponse) => void
  /** Asked before a row is sent; false lets the row go unsent (what put it there no longer stands). */
  allowed?: (row: OutboxRow) => Promise<boolean>
  /** Called after each row's save ends and the row is dealt with, for whoever put the row there to follow up. */
  settled?: (row: OutboxRow, outcome: RowOutcome) => Promise<void>
}

export interface Resume {
  /** Stops sending: the account, the library or the worker changed. Rows stay for the next load. */
  cancel: () => void
  finished: Promise<ResumeResult>
}

/**
 * Finishes what an earlier visit began to save and did not: after the account's library has loaded, each row
 * the outbox still holds whose workout the server does not have is created, side by side as an import does,
 * and removed once the server has it. It runs apart from the requests the worker answers, so the page works
 * while it does, and it tells the page how it is going and how it ended.
 *
 * Only a refusal counts against a row: after a few the athlete is told it could not be saved, to add its file
 * again. A stop (a limit, a signed-out account), a lost connection, a row an import is sending or one a newer
 * version wrote leaves the row as it is for another day. A row from an older analysis is not sent, since the
 * server would refuse it, and not dropped: it stays, and counts among those that need their file added again.
 */
export function resumeOutbox(ctx: ResumeContext): Resume {
  let cancelled = false
  const finished = (async (): Promise<ResumeResult> => {
    const rows = await ctx.outbox.pending()
    if (rows.length === 0 || cancelled)
      return { saved: 0, failed: 0, conflicts: 0, kept: 0, stopped: null }
    const held = new Set([...ctx.savedRecords.values()].map(({ digest }) => workoutKeyOf(digest)))
    ctx.post({ type: 'outbox', pending: rows.length, saved: 0, failed: 0, finished: false })
    const gate = new Gate(SAVE_CONCURRENCY)
    // A limit or an ended session would refuse the rest the same way: one save waits it out, the rest do not ask.
    let stopped: SyncIssueCode | null = null
    const stop = new SaveStop((code) => {
      cancelled = true
      stopped = code
    })
    let saved = 0
    let failed = 0
    let conflicts = 0
    // Rows still in the outbox when this ends.
    let kept = 0
    let left = rows.length
    /** What became of the row. */
    const resumeRow = async (row: OutboxRow): Promise<RowOutcome> => {
      if (ctx.allowed !== undefined && !(await ctx.allowed(row))) {
        await ctx.outbox.done(row.key, row.digestId)
        return 'held'
      }
      const digest = digestOf(row)
      if (digest === null) {
        // A summary this version cannot read: nothing to send, and nothing a retry would change.
        await ctx.outbox.done(row.key, row.digestId)
        return 'let-go'
      }
      const revision = revisionStatus(digest.modelRevision)
      // A newer version of the app wrote it: it is left alone, as the kept library leaves such a row.
      if (revision === 'newer') return 'kept'
      // A digest the server would refuse is not sent, and not dropped: it stays until its file is added again (the
      // library counts it with the activities that need their files). One it reads beside the current model (compatible) is sent.
      if (revision === 'stale') return 'stale'
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
          return ctx.sending.run(row.key, async () => {
            if (cancelled) throw new NotSent()
            // Asked at the moment of sending too, not only when the row was taken up: a rate limit's wait is
            // long enough for another tab to empty the library the row came from.
            if (ctx.allowed !== undefined && !(await ctx.allowed(row))) throw new NoLongerAllowed()
            if (cancelled) throw new NotSent()
            return createActivity(digest, row.fileName, row.fileHash, ctx.userId)
          })
        })
        ctx.savedRecords.set(record.id, record)
        await ctx.outbox.done(row.key, row.digestId)
        return 'saved'
      } catch (error) {
        if (error instanceof NotSent) return 'kept'
        if (error instanceof NoLongerAllowed) {
          await ctx.outbox.done(row.key, row.digestId)
          return 'held'
        }
        const failure = syncFailureOf(error)
        stop.noteFailure(failure.code)
        if (NEVER_TAKEN.has(failure.code)) {
          await ctx.outbox.done(row.key, row.digestId)
          return failure.code === 'activity-conflict' ? 'conflict' : 'let-go'
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
          else if (outcome === 'let-go' || outcome === 'conflict' || outcome === 'stale') failed++
          else if (outcome === 'kept') kept++
          if (outcome === 'conflict') conflicts++
          await ctx.settled?.(row, outcome).catch(() => undefined)
          left--
          if (!cancelled) {
            ctx.post({ type: 'outbox', pending: left, saved, failed, finished: false })
          }
        }),
      ),
    )
    ctx.post({ type: 'outbox', pending: kept, saved, failed, finished: true })
    return { saved, failed, conflicts, kept, stopped: stopped as SyncIssueCode | null }
  })()
  return {
    cancel: () => {
      cancelled = true
    },
    finished,
  }
}

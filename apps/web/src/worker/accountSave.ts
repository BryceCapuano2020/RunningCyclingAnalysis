import { MAX_FILE_BYTES } from '@rca/contract'
import type { ActivityRecord } from '@rca/contract'
import { revisionStatus } from '@rca/core/digest/revisions'
import { isTransient, SyncFailure } from '@rca/core/session'
import type { SyncItem, SyncSink } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { ApiRequestError, createActivity, uploadFile } from '../api/client'
import { workoutKeyOf } from './device'
import {
  Gate,
  MAX_BYTES_IN_FLIGHT,
  MAX_SAVES_IN_FLIGHT,
  Room,
  SAVE_CONCURRENCY,
  UPLOAD_CONCURRENCY,
} from './saveLimits'
import { DeferredOriginals } from './deferredOriginals'
import type { FailedOriginals } from './failedOriginals'
import type { SyncOptions } from './protocol'
import { retryAfterUploadSlot, SaveStop } from './rateLimitRetry'
import type { RouteMemory } from './routes'
import { syncFailureOf } from './syncIssue'
import type { Outbox } from './outbox'
import type { SendingKeys } from './sendingKeys'

/** Failures after which a saved row would be tried again for nothing: the server holds another copy, or the account is going. */
const NEVER_TAKEN: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'activity-conflict',
  'account-deleting',
])

/** What saving to the account reads and changes in the worker. */
export interface AccountSaveContext {
  sync: SyncOptions
  savedRecords: Map<string, ActivityRecord>
  /** Keys of saved activities whose original file is not in the library. */
  missingOriginals: Set<string>
  routes: Pick<RouteMemory, 'remember'>
  /** Called after each activity is saved, with its original when files are kept. */
  onSaved: () => void
  /** Called when a rate limit holds the saves back, just before they wait for it to lift. */
  onPaused: () => void
  /** Called with the first failure that stops the import's saves. */
  onStopped: (code: SyncIssueCode) => void
  /** Where a save is written before it begins, so a reload can finish it (see outbox.ts). Absent: not resumable. */
  outbox?: Outbox
  /** The workouts being sent, shared with the outbox resume so a file added again is not sent by both at once. */
  sending?: SendingKeys
  /** The ids of the digests the analysis hides as the library stands: an original held back for one is decided early only if it is not among them. */
  hiddenIds?: () => ReadonlySet<string>
  /** Where an original whose upload failed for a passing reason waits to be sent again (see FailedOriginals). */
  failedOriginals?: FailedOriginals
}

/**
 * Saves each activity of an import to the account, and uploads its original when files are kept.
 * A rate limit is waited out, by one save for all, and the activity tried once more. A failure is thrown as a
 * SyncFailure. The first one that stops saving is reported to `onStopped`, and the saves still waiting fail with
 * the same cause without being sent.
 */
export function accountSaver(ctx: AccountSaveContext): SyncSink {
  const { sync, savedRecords, missingOriginals } = ctx
  let storageBudgetExhausted = false
  const creates = new Gate(SAVE_CONCURRENCY)
  const uploads = new Gate(UPLOAD_CONCURRENCY)
  const room = new Room(MAX_SAVES_IN_FLIGHT, MAX_BYTES_IN_FLIGHT)
  const stop = new SaveStop(ctx.onStopped)

  const upload = async (record: ActivityRecord, item: SyncItem): Promise<void> => {
    // The limit is inclusive: a file of exactly MAX_FILE_BYTES is kept.
    if (item.bytes.byteLength > MAX_FILE_BYTES) {
      throw new SyncFailure(
        'file-too-large',
        'Original exceeds the upload limit; digest saved without its file',
      )
    }
    const spent = () =>
      new SyncFailure('storage-budget', 'Original-file storage allowance is exhausted')
    if (storageBudgetExhausted) throw spent()
    // A rate limit is waited out the way a create's is: one upload waits the Retry-After for all and tries again, the
    // uploads that meet it meanwhile follow how that try ends, and a second refusal ends the saves (see SaveStop).
    const saved = await stop.run(
      (leading) =>
        retryAfterUploadSlot(() =>
          uploads.run(async () => {
            // Held behind a limit being waited out (the try that ends the wait is not), and not sent once the saves
            // have stopped or the allowance is spent.
            if (leading) stop.check()
            else await stop.ready()
            if (storageBudgetExhausted) throw spent()
            // Noted before the slot is given up, so the upload waiting for it finds the allowance spent.
            return uploadFile(record.id, item.bytes, sync.userId).catch((error: unknown) => {
              if (error instanceof ApiRequestError && error.code === 'storage_budget_exhausted') {
                storageBudgetExhausted = true
              }
              throw error
            })
          }),
        ),
      ctx.onPaused,
    )
    savedRecords.set(record.id, saved)
  }

  const originals = new DeferredOriginals({
    // An original over the limit is failed at once: holding it to the end would only hold its bytes.
    refuse: (item) => (item.bytes.byteLength > MAX_FILE_BYTES ? 'file-too-large' : null),
    upload: async (record, item) => {
      await upload(record, item)
      missingOriginals.delete(workoutKeyOf(item.digest))
      ctx.failedOriginals?.drop(workoutKeyOf(item.digest))
    },
    hiddenNow: () => ctx.hiddenIds?.() ?? new Set(),
    codeOf: (error, record, item) => {
      const { code } = syncFailureOf(error)
      stop.noteFailure(code)
      if (ctx.failedOriginals === undefined || !isTransient(code)) return code
      // Held for Try again now and the automatic resend; past the budget the athlete is told to add the file again.
      return ctx.failedOriginals.keep(sync.userId, record, item.bytes, code, item.digest.id)
        ? 'original-held'
        : 'original-unsent'
    },
  })

  const saveOnce = async (item: SyncItem, leading: boolean): Promise<void> => {
    const key = workoutKeyOf(item.digest)
    // A file added again for a workout the account holds from an older analysis upgrades that row, under the id, file
    // name and title it has, so the title it was saved with is kept (a create would send a generated one).
    const stale = [...savedRecords.values()].find(
      (held) =>
        workoutKeyOf(held.digest) === key &&
        revisionStatus(held.digest.modelRevision) !== 'current',
    )
    const create = () =>
      stale === undefined
        ? createActivity(item.digest, item.fileName, item.fileHash, sync.userId)
        : createActivity(
            { ...item.digest, id: stale.digest.id, name: stale.digest.name },
            stale.fileName,
            item.fileHash,
            sync.userId,
            stale.id,
          )
    const send = () => (ctx.sending === undefined ? create() : ctx.sending.run(key, create))
    // The try that follows a rate limit goes round the gate, which the saves waiting out the same limit may hold
    // full; it is one request beyond the gate's limit.
    const { record } = await (leading
      ? send()
      : creates.run(async () => {
          // A save that waited for its turn sends nothing if the saves stopped, or waits out a limit first.
          await stop.ready()
          return send()
        }))
    // The server has it: the row has done its work, whatever becomes of the original file.
    await ctx.outbox?.done(key, item.digest.id)
    savedRecords.set(record.id, record)
    ctx.routes.remember(record.id, item.route ?? null)
    if (record.hasFile) missingOriginals.delete(key)
    else missingOriginals.add(key)
    // The original is held until the import is read, then kept for the shown copy of the workout only (rule R).
    // A better copy that a later import brings does not replace this one's file: the server keeps it, orphaned, and it
    // counts against the original-file budget until a delete of the group removes it.
    if (sync.keepFiles && !record.hasFile) await originals.add(record, item)
    ctx.onSaved()
  }

  const save = async (item: SyncItem): Promise<void> => {
    await ctx.outbox?.add(item)
    try {
      await stop.run((leading) => saveOnce(item, leading), ctx.onPaused)
    } catch (error) {
      const failure = syncFailureOf(error)
      stop.noteFailure(failure.code)
      // The row stays for a reload to finish, unless the server will never take this activity.
      if (NEVER_TAKEN.has(failure.code))
        await ctx.outbox?.done(workoutKeyOf(item.digest), item.digest.id)
      throw failure
    }
  }

  const sink: SyncSink = async (item) => {
    // A replacement or a retry is saved before the next file is looked at, as it always was.
    if (item.queueable !== true) return await save(item)
    // A new activity is saved beside the others, up to what the server and the browser can hold at once. The
    // import goes on reading while its saves run, and waits for them all before it ends.
    await room.enter(item.bytes.byteLength)
    const done = save(item).finally(() => room.leave(item.bytes.byteLength))
    // Whatever a save throws is the import's to read, from `done`; an unread rejection would be a second report.
    done.catch(() => undefined)
    return { done }
  }
  return Object.assign(sink, { finish: (hidden: ReadonlySet<string>) => originals.finish(hidden) })
}

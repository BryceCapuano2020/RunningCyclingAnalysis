import { MAX_FILE_BYTES } from '@rca/contract'
import type { ActivityRecord } from '@rca/contract'
import { SyncFailure } from '@rca/core/session'
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
import type { SyncOptions } from './protocol'
import { retryAfterUploadSlot, SaveStop } from './rateLimitRetry'
import type { RouteMemory } from './routes'
import { syncFailureOf } from './syncIssue'
import type { Outbox } from './outbox'

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
    if (storageBudgetExhausted) {
      throw new SyncFailure('storage-budget', 'Original-file storage allowance is exhausted')
    }
    try {
      const saved = await retryAfterUploadSlot(() =>
        uploads.run(() => {
          // Saves stopped while this one waited for an upload slot send nothing more.
          stop.check()
          return uploadFile(record.id, item.bytes, sync.userId)
        }),
      )
      savedRecords.set(record.id, saved)
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'storage_budget_exhausted') {
        storageBudgetExhausted = true
      }
      throw error
    }
  }

  const saveOnce = async (item: SyncItem, leading: boolean): Promise<void> => {
    const key = workoutKeyOf(item.digest)
    const send = () => createActivity(item.digest, item.fileName, item.fileHash, sync.userId)
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
    if (sync.keepFiles && !record.hasFile) {
      try {
        await upload(record, item)
      } catch (error) {
        // The digest is saved. Only the original is missing, which says nothing about the network.
        const failure = syncFailureOf(error)
        throw new SyncFailure(failure.code, failure.message, true)
      }
      missingOriginals.delete(key)
    }
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

  return async (item) => {
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
}

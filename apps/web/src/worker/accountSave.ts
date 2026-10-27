import { MAX_FILE_BYTES } from '@rca/contract'
import type { ActivityRecord } from '@rca/contract'
import { stopsSaving, SyncFailure } from '@rca/core/session'
import type { SyncItem, SyncSink } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { ApiRequestError, createActivity, uploadFile } from '../api/client'
import { workoutKeyOf } from './device'
import type { SyncOptions } from './protocol'
import { retryAfterRateLimit } from './rateLimitRetry'
import type { RouteMemory } from './routes'
import { syncFailureOf } from './syncIssue'

/** What saving to the account reads and changes in the worker. */
export interface AccountSaveContext {
  sync: SyncOptions
  savedRecords: Map<string, ActivityRecord>
  /** Keys of saved activities whose original file is not in the library. */
  missingOriginals: Set<string>
  routes: Pick<RouteMemory, 'remember'>
  /** Called after each activity is saved, with its original when files are kept. */
  onSaved: () => void
  /** Called with the first failure that stops the import's saves. */
  onStopped: (code: SyncIssueCode) => void
}

/**
 * Saves each activity of an import to the account, and uploads its original when files are kept.
 * A rate limit is waited out and the activity tried once more. A failure is thrown as a SyncFailure,
 * and the first one that stops saving is reported to `onStopped`.
 */
export function accountSaver(ctx: AccountSaveContext): SyncSink {
  const { sync, savedRecords, missingOriginals } = ctx
  let storageBudgetExhausted = false

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
      savedRecords.set(record.id, await uploadFile(record.id, item.bytes, sync.userId))
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'storage_budget_exhausted') {
        storageBudgetExhausted = true
      }
      throw error
    }
  }

  const saveOnce = async (item: SyncItem): Promise<void> => {
    const key = workoutKeyOf(item.digest)
    const { record } = await createActivity(item.digest, item.fileName, item.fileHash, sync.userId)
    savedRecords.set(record.id, record)
    ctx.routes.remember(record.id, item.route ?? null)
    if (record.hasFile) missingOriginals.delete(key)
    else missingOriginals.add(key)
    if (sync.keepFiles && !record.hasFile) {
      await upload(record, item)
      missingOriginals.delete(key)
    }
    ctx.onSaved()
  }

  return async (item) => {
    try {
      await retryAfterRateLimit(() => saveOnce(item))
    } catch (error) {
      const failure = syncFailureOf(error)
      if (stopsSaving(failure.code)) ctx.onStopped(failure.code)
      throw failure
    }
  }
}

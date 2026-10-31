import type { ActivityTrace } from '@rca/core/workbench'
import {
  DEVICE_EPOCH_KEY,
  ENTRIES,
  OWNERS,
  STATE,
  TRACES,
  abortQuietly,
  activityTraceBytes,
  entryKey,
  epochOfRow,
  parseBoundedTrace,
  requestResult,
  scopeKey,
  subtractMetadata,
  transactionDone,
  validTraceMetadata,
  workbenchDatabase,
  resetWorkbenchDatabase,
  WorkbenchOpenError,
} from './workbenchSchema'
import type { PutResult, StoredTrace, TraceScope } from './workbenchSchema'
import { putTrace } from './workbenchPut'
import { rebuildLedger } from './workbenchLedger'

export type { PutResult, TraceScope } from './workbenchSchema'
export { WORKBENCH_ENTRY_BYTES, WORKBENCH_TOTAL_BYTES, activityTraceBytes } from './workbenchSchema'

export interface WorkbenchStore {
  get(scope: TraceScope, activityId: string): Promise<ActivityTrace | null>
  /**
   * Keeps the trace of an activity that started at `startMs`, dropping the recordings of the oldest
   * activities to make room. Never drops one of a newer activity: when the cache is full of those the
   * result is `outranked`. `refused` is storage that would not take it, or a trace over a cache limit.
   * The trace is the app's own (from activityTraceOf), so it is not validated; `get` validates what it reads.
   */
  put(scope: TraceScope, trace: ActivityTrace, startMs: number, epoch?: number): Promise<PutResult>
  /**
   * The device scope's epoch: a number that rises each time the scope is cleared, in the transaction that
   * clears it. A device write that carries the epoch it loaded under is refused (`replaced`) once it has moved.
   * Rejects when storage cannot say.
   */
  deviceEpoch(): Promise<number>
  /**
   * The recordings stored for the scope: each one's activity id and when the activity started. Null when
   * storage cannot say. Reads only the metadata, never a trace.
   */
  list(scope: TraceScope): Promise<StoredEntry[] | null>
  /** Whether a trace is stored, without reading it. Null when storage cannot say. */
  has(scope: TraceScope, activityId: string): Promise<boolean | null>
  /**
   * Resolves false only when storage refused the removal. Storage that cannot be opened at all holds
   * nothing, so removing from it succeeds.
   */
  remove(scope: TraceScope, activityId: string): Promise<boolean>
  /**
   * As remove, for every trace of the scope. An account scope also refuses later writes, so a capture
   * in flight at sign-out cannot write back, until `reopenScope` at the account's next sign-in.
   */
  clearScope(scope: TraceScope): Promise<boolean>
  /**
   * Whether the scope refuses writes: deleted for good, or cleared at sign-out and not reopened.
   * Rejects when storage cannot say, so a caller can tell an unknown scope from a closed one.
   */
  isDeleted(scope: TraceScope): Promise<boolean>
  /** Clears one account scope and permanently blocks writes from a stale worker. */
  deleteScope(scope: Extract<TraceScope, { kind: 'account' }>): Promise<boolean>
  /** Lets a signed-in account's scope be written again. A deleted account stays blocked. */
  reopenScope(scope: Extract<TraceScope, { kind: 'account' }>): Promise<boolean>
}

/** One stored recording, as `list` names it. */
export interface StoredEntry {
  activityId: string
  startMs: number
}

/** What closed an account scope. Deletion is for good; a sign-out ends at the next sign-in. */
type Closing = 'signed-out' | 'deleted'

interface OwnerRow {
  scopeKey: string
  deletedAt?: number
  signedOutAt?: number
}

/** A database that cannot be opened at all never held a trace, so removing from it has nothing to do. */
function nothingCached(error: unknown): boolean {
  return error instanceof WorkbenchOpenError && error.nothingCached
}

/** Records that an account scope refuses writes. A sign-out never replaces the mark of a deletion. */
async function closeScope(
  owners: IDBObjectStore,
  scope: Extract<TraceScope, { kind: 'account' }>,
  closing: Closing,
): Promise<void> {
  const key = scopeKey(scope)
  if (closing === 'deleted') {
    owners.put({ scopeKey: key, deletedAt: Date.now() } satisfies OwnerRow)
    return
  }
  const row = (await requestResult(owners.get(key))) as OwnerRow | undefined
  if (row?.deletedAt === undefined)
    owners.put({ scopeKey: key, signedOutAt: Date.now() } satisfies OwnerRow)
}

/** A separate database keeps this schema independent of the long-lived digest library. */
export function openWorkbenchStore(): WorkbenchStore {
  async function clear(scope: TraceScope, closing: Closing): Promise<boolean> {
    let transaction: IDBTransaction | null = null
    try {
      const db = await workbenchDatabase(true)
      transaction = db.transaction([TRACES, ENTRIES, STATE, OWNERS], 'readwrite')
      const done = transactionDone(transaction)
      done.catch(() => undefined)
      const traces = transaction.objectStore(TRACES)
      const entries = transaction.objectStore(ENTRIES)
      const cursorRequest = entries.index('scopeKey').openCursor(IDBKeyRange.only(scopeKey(scope)))
      await new Promise<void>((resolve, reject) => {
        cursorRequest.onerror = () =>
          reject(cursorRequest.error ?? new Error('Workbench storage failed'))
        cursorRequest.onsuccess = () => {
          // A throw here would leave the request unanswered, and the serial queue behind it stuck.
          try {
            const cursor = cursorRequest.result
            if (!cursor) return resolve()
            if (typeof cursor.primaryKey === 'string') traces.delete(cursor.primaryKey)
            cursor.delete()
            cursor.continue()
          } catch (error) {
            reject(error)
          }
        }
      })
      await rebuildLedger(transaction)
      if (scope.kind === 'device') {
        const stateStore = transaction.objectStore(STATE)
        const next = epochOfRow(await requestResult(stateStore.get(DEVICE_EPOCH_KEY))) + 1
        stateStore.put({ key: DEVICE_EPOCH_KEY, epoch: next })
      }
      if (scope.kind === 'account')
        await closeScope(transaction.objectStore(OWNERS), scope, closing)
      await done
      return true
    } catch (error) {
      abortQuietly(transaction)
      resetWorkbenchDatabase()
      return nothingCached(error)
    }
  }

  return {
    async get(scope, activityId) {
      let transaction: IDBTransaction | null = null
      try {
        const db = await workbenchDatabase()
        transaction = db.transaction([TRACES, ENTRIES, STATE, OWNERS], 'readwrite')
        const done = transactionDone(transaction)
        done.catch(() => undefined)
        const key = entryKey(scope, activityId)
        const entries = transaction.objectStore(ENTRIES)
        const traces = transaction.objectStore(TRACES)
        const [rawMetadata, row, deleted] = await Promise.all([
          requestResult(entries.get(key)) as Promise<unknown>,
          requestResult(traces.get(key)) as Promise<StoredTrace | undefined>,
          scope.kind === 'account'
            ? (requestResult(
                transaction.objectStore(OWNERS).get(scopeKey(scope)),
              ) as Promise<unknown>)
            : Promise.resolve(undefined),
        ])
        if (deleted) {
          await done
          return null
        }
        if (rawMetadata === undefined && row === undefined) {
          await done
          return null
        }
        const trace = row && parseBoundedTrace(row.trace)
        if (
          !validTraceMetadata(rawMetadata) ||
          !trace ||
          trace.activityId !== activityId ||
          rawMetadata.scopeKey !== scopeKey(scope) ||
          rawMetadata.activityId !== activityId ||
          rawMetadata.bytes !== activityTraceBytes(trace)
        ) {
          entries.delete(key)
          traces.delete(key)
          await rebuildLedger(transaction)
          await done
          return null
        }
        const metadata = rawMetadata
        metadata.savedAt = Date.now()
        entries.put(metadata)
        await done
        return trace
      } catch {
        abortQuietly(transaction)
        resetWorkbenchDatabase()
        return null
      }
    },

    put: putTrace,

    async deviceEpoch() {
      try {
        const db = await workbenchDatabase()
        const transaction = db.transaction(STATE, 'readonly')
        const row = await requestResult(transaction.objectStore(STATE).get(DEVICE_EPOCH_KEY))
        await transactionDone(transaction)
        return epochOfRow(row)
      } catch (error) {
        resetWorkbenchDatabase()
        throw error
      }
    },

    async has(scope, activityId) {
      try {
        const db = await workbenchDatabase()
        const transaction = db.transaction(ENTRIES, 'readonly')
        const row = await requestResult(
          transaction.objectStore(ENTRIES).get(entryKey(scope, activityId)),
        )
        await transactionDone(transaction)
        return row !== undefined
      } catch {
        resetWorkbenchDatabase()
        return null
      }
    },

    async list(scope) {
      try {
        const db = await workbenchDatabase()
        const transaction = db.transaction(ENTRIES, 'readonly')
        const found: StoredEntry[] = []
        const request = transaction
          .objectStore(ENTRIES)
          .index('scopeKey')
          .openCursor(IDBKeyRange.only(scopeKey(scope)))
        await new Promise<void>((resolve, reject) => {
          request.onerror = () => reject(request.error ?? new Error('Workbench storage failed'))
          request.onsuccess = () => {
            try {
              const cursor = request.result
              if (!cursor) return resolve()
              const row: unknown = cursor.value
              if (validTraceMetadata(row))
                found.push({ activityId: row.activityId, startMs: row.startMs })
              cursor.continue()
            } catch (error) {
              reject(error)
            }
          }
        })
        await transactionDone(transaction)
        return found
      } catch {
        resetWorkbenchDatabase()
        return null
      }
    },

    async isDeleted(scope) {
      if (scope.kind !== 'account') return false
      try {
        const db = await workbenchDatabase()
        const transaction = db.transaction(OWNERS, 'readonly')
        const deleted = await requestResult(transaction.objectStore(OWNERS).get(scopeKey(scope)))
        await transactionDone(transaction)
        return deleted !== undefined
      } catch (error) {
        resetWorkbenchDatabase()
        throw error
      }
    },

    async remove(scope, activityId) {
      let transaction: IDBTransaction | null = null
      try {
        const db = await workbenchDatabase(true)
        transaction = db.transaction([TRACES, ENTRIES, STATE], 'readwrite')
        const done = transactionDone(transaction)
        done.catch(() => undefined)
        const key = entryKey(scope, activityId)
        const entries = transaction.objectStore(ENTRIES)
        const rawMetadata = (await requestResult(entries.get(key))) as unknown
        entries.delete(key)
        transaction.objectStore(TRACES).delete(key)
        if (rawMetadata === undefined) {
          await done
          return true
        }
        const stateStore = transaction.objectStore(STATE)
        const state = (await requestResult(stateStore.get('total'))) as unknown
        const updated = subtractMetadata(state, rawMetadata)
        if (updated === null) await rebuildLedger(transaction)
        else stateStore.put(updated)
        await done
        return true
      } catch (error) {
        abortQuietly(transaction)
        resetWorkbenchDatabase()
        return nothingCached(error)
      }
    },

    async reopenScope(scope) {
      let transaction: IDBTransaction | null = null
      try {
        const db = await workbenchDatabase(true)
        transaction = db.transaction(OWNERS, 'readwrite')
        const done = transactionDone(transaction)
        done.catch(() => undefined)
        const owners = transaction.objectStore(OWNERS)
        const row = (await requestResult(owners.get(scopeKey(scope)))) as OwnerRow | undefined
        if (row !== undefined && row.deletedAt === undefined) owners.delete(scopeKey(scope))
        await done
        return true
      } catch (error) {
        abortQuietly(transaction)
        resetWorkbenchDatabase()
        return nothingCached(error)
      }
    },

    clearScope: (scope) => clear(scope, 'signed-out'),
    deleteScope: (scope) => clear(scope, 'deleted'),
  }
}

/** Removes traces for a reusable scope; later imports may write there again. */
export function clearWorkbenchScope(scope: TraceScope): Promise<boolean> {
  return openWorkbenchStore().clearScope(scope)
}

/** Removes one account's traces and prevents a stale worker from writing them back. */
export function deleteWorkbenchScope(
  scope: Extract<TraceScope, { kind: 'account' }>,
): Promise<boolean> {
  return openWorkbenchStore().deleteScope(scope)
}

/**
 * The ids of the accounts that have recordings stored in this browser. Rejects when storage cannot
 * say. Never lists the device scope.
 */
export async function accountsWithRecordings(): Promise<string[]> {
  try {
    const db = await workbenchDatabase()
    const transaction = db.transaction(ENTRIES, 'readonly')
    const request = transaction
      .objectStore(ENTRIES)
      .index('scopeKey')
      .openKeyCursor(null, 'nextunique')
    const prefix = 'account:'
    const found: string[] = []
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error('Workbench storage failed'))
      request.onsuccess = () => {
        try {
          const cursor = request.result
          if (!cursor) return resolve()
          if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix))
            found.push(cursor.key.slice(prefix.length))
          cursor.continue()
        } catch (error) {
          reject(error)
        }
      }
    })
    await transactionDone(transaction)
    return found
  } catch (error) {
    resetWorkbenchDatabase()
    throw error
  }
}

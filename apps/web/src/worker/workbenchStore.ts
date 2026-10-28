import type { ActivityTrace } from '@rca/core/workbench'
import {
  ENTRIES,
  OWNERS,
  STATE,
  TRACES,
  WORKBENCH_ENTRY_BYTES,
  WORKBENCH_MAX_ENTRIES,
  WORKBENCH_TOTAL_BYTES,
  activityTraceBytes,
  entryKey,
  parseBoundedTrace,
  requestResult,
  scopeKey,
  subtractMetadata,
  transactionDone,
  validStoreState,
  validTraceMetadata,
  workbenchDatabase,
  resetWorkbenchDatabase,
  WorkbenchOpenError,
} from './workbenchSchema'
import type { StoreState, StoredTrace, TraceMetadata, TraceScope } from './workbenchSchema'

export type { TraceScope } from './workbenchSchema'
export { WORKBENCH_ENTRY_BYTES, WORKBENCH_TOTAL_BYTES, activityTraceBytes } from './workbenchSchema'

export interface WorkbenchStore {
  get(scope: TraceScope, activityId: string): Promise<ActivityTrace | null>
  /** Returns false when storage refuses the trace or it exceeds a cache limit. */
  put(scope: TraceScope, trace: ActivityTrace): Promise<boolean>
  /** Whether a trace is stored, without reading it. False when storage cannot say. */
  has(scope: TraceScope, activityId: string): Promise<boolean>
  /**
   * Resolves false only when storage refused the removal. Storage that cannot be opened at all holds
   * nothing, so removing from it succeeds.
   */
  remove(scope: TraceScope, activityId: string): Promise<boolean>
  /** As remove, for every trace of the scope. */
  clearScope(scope: TraceScope): Promise<boolean>
  /** Rejects when storage cannot say, so a caller can tell an unknown scope from a deleted one. */
  isDeleted(scope: TraceScope): Promise<boolean>
  /** Clears one account scope and permanently blocks writes from a stale worker. */
  deleteScope(scope: Extract<TraceScope, { kind: 'account' }>): Promise<boolean>
}

/** A database that cannot be opened at all never held a trace, so removing from it has nothing to do. */
function nothingCached(error: unknown): boolean {
  return error instanceof WorkbenchOpenError && error.nothingCached
}

/** Rebuilds accounting from small metadata rows and removes malformed or over-budget entries. */
async function rebuildLedger(transaction: IDBTransaction): Promise<void> {
  const entries = transaction.objectStore(ENTRIES)
  const traces = transaction.objectStore(TRACES)
  let bytes = 0
  let count = 0
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = entries.openCursor()
    cursorRequest.onerror = () =>
      reject(cursorRequest.error ?? new Error('Workbench storage failed'))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return resolve()
      const row = cursor.value
      if (!validTraceMetadata(row)) {
        if (typeof cursor.primaryKey === 'string') traces.delete(cursor.primaryKey)
        cursor.delete()
      } else {
        bytes += row.bytes
        count++
      }
      cursor.continue()
    }
  })
  if (bytes > WORKBENCH_TOTAL_BYTES || count > WORKBENCH_MAX_ENTRIES) {
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = entries.index('savedAt').openCursor()
      cursorRequest.onerror = () =>
        reject(cursorRequest.error ?? new Error('Workbench storage failed'))
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor || (bytes <= WORKBENCH_TOTAL_BYTES && count <= WORKBENCH_MAX_ENTRIES))
          return resolve()
        const row = cursor.value as TraceMetadata
        bytes -= row.bytes
        count--
        traces.delete(row.key)
        cursor.delete()
        cursor.continue()
      }
    })
  }
  transaction.objectStore(STATE).put({ key: 'total', bytes, count } satisfies StoreState)
}

/** Repairs metadata accounting in an isolated transaction after a corrupt row aborts a write. */
async function repairLedger(): Promise<boolean> {
  try {
    const db = await workbenchDatabase()
    const transaction = db.transaction([TRACES, ENTRIES, STATE], 'readwrite')
    const done = transactionDone(transaction)
    await rebuildLedger(transaction)
    await done
    return true
  } catch {
    resetWorkbenchDatabase()
    return false
  }
}

/** A separate database keeps this schema independent of the long-lived digest library. */
export function openWorkbenchStore(): WorkbenchStore {
  async function clear(scope: TraceScope, tombstone = false): Promise<boolean> {
    try {
      const db = await workbenchDatabase()
      const transaction = db.transaction([TRACES, ENTRIES, STATE, OWNERS], 'readwrite')
      const done = transactionDone(transaction)
      const traces = transaction.objectStore(TRACES)
      const entries = transaction.objectStore(ENTRIES)
      const cursorRequest = entries.index('scopeKey').openCursor(IDBKeyRange.only(scopeKey(scope)))
      await new Promise<void>((resolve, reject) => {
        cursorRequest.onerror = () =>
          reject(cursorRequest.error ?? new Error('Workbench storage failed'))
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return resolve()
          if (typeof cursor.primaryKey === 'string') traces.delete(cursor.primaryKey)
          cursor.delete()
          cursor.continue()
        }
      })
      await rebuildLedger(transaction)
      if (tombstone && scope.kind === 'account')
        transaction.objectStore(OWNERS).put({ scopeKey: scopeKey(scope), deletedAt: Date.now() })
      await done
      return true
    } catch (error) {
      resetWorkbenchDatabase()
      return nothingCached(error)
    }
  }

  async function putTrace(
    scope: TraceScope,
    input: ActivityTrace,
    repaired: boolean,
  ): Promise<boolean> {
    try {
      const trace = parseBoundedTrace(input)
      if (!trace || trace.activityId !== input.activityId) return false
      const bytes = activityTraceBytes(trace)
      if (bytes > WORKBENCH_ENTRY_BYTES) return false
      const db = await workbenchDatabase()
      const transaction = db.transaction([TRACES, ENTRIES, STATE, OWNERS], 'readwrite')
      const done = transactionDone(transaction)
      const key = entryKey(scope, trace.activityId)
      const entries = transaction.objectStore(ENTRIES)
      const traces = transaction.objectStore(TRACES)
      const stateStore = transaction.objectStore(STATE)
      const owners = transaction.objectStore(OWNERS)
      if (scope.kind === 'account' && (await requestResult(owners.get(scopeKey(scope))))) {
        transaction.abort()
        await done.catch(() => undefined)
        return false
      }
      const [prior, stateRow] = await Promise.all([
        requestResult(entries.get(key)) as Promise<unknown>,
        requestResult(stateStore.get('total')) as Promise<unknown>,
      ])
      const ledger = validStoreState(stateRow) ? stateRow : null
      const metadata = prior === undefined ? undefined : prior
      const adjusted = metadata === undefined ? ledger : subtractMetadata(ledger, metadata)
      if (adjusted === null) {
        transaction.abort()
        await done.catch(() => undefined)
        if (!repaired && (await repairLedger())) return putTrace(scope, input, true)
        return false
      }
      let totalBytes = adjusted.bytes
      let count = adjusted.count
      const mustEvict = () =>
        totalBytes + bytes > WORKBENCH_TOTAL_BYTES || count >= WORKBENCH_MAX_ENTRIES
      let corruptCandidate = false
      if (mustEvict()) {
        const cursorRequest = entries.index('savedAt').openCursor()
        await new Promise<void>((resolve, reject) => {
          cursorRequest.onerror = () =>
            reject(cursorRequest.error ?? new Error('Workbench storage failed'))
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor || !mustEvict() || corruptCandidate) return resolve()
            if (!validTraceMetadata(cursor.value)) {
              corruptCandidate = true
              return resolve()
            }
            const candidate = cursor.value
            if (candidate.key !== key) {
              traces.delete(candidate.key)
              totalBytes -= candidate.bytes
              count--
              cursor.delete()
            }
            cursor.continue()
          }
        })
      }
      if (corruptCandidate || !Number.isSafeInteger(totalBytes) || totalBytes < 0 || count < 0) {
        transaction.abort()
        await done.catch(() => undefined)
        if (!repaired && (await repairLedger())) return putTrace(scope, input, true)
        return false
      }
      if (mustEvict()) {
        transaction.abort()
        await done.catch(() => undefined)
        if (!repaired && (await repairLedger())) return putTrace(scope, input, true)
        return false
      }
      const row: TraceMetadata = {
        key,
        scopeKey: scopeKey(scope),
        activityId: trace.activityId,
        savedAt: Date.now(),
        bytes,
      }
      entries.put(row)
      traces.put({ key, trace } satisfies StoredTrace)
      stateStore.put({
        key: 'total',
        bytes: totalBytes + bytes,
        count: count + 1,
      } satisfies StoreState)
      await done
      return true
    } catch {
      resetWorkbenchDatabase()
      return false
    }
  }

  return {
    async get(scope, activityId) {
      try {
        const db = await workbenchDatabase()
        const transaction = db.transaction([TRACES, ENTRIES, STATE, OWNERS], 'readwrite')
        const done = transactionDone(transaction)
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
        resetWorkbenchDatabase()
        return null
      }
    },

    put: (scope, trace) => putTrace(scope, trace, false),

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
        return false
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
      try {
        const db = await workbenchDatabase()
        const transaction = db.transaction([TRACES, ENTRIES, STATE], 'readwrite')
        const done = transactionDone(transaction)
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
        resetWorkbenchDatabase()
        return nothingCached(error)
      }
    },

    clearScope: (scope) => clear(scope),
    deleteScope: (scope) => clear(scope, true),
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

/** Reports whether account-scoped evidence was permanently deleted on this browser. */
export function workbenchScopeDeleted(
  scope: Extract<TraceScope, { kind: 'account' }>,
): Promise<boolean> {
  return openWorkbenchStore().isDeleted(scope)
}

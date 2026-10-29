import {
  ENTRIES,
  RANK_INDEX,
  STATE,
  TRACES,
  WORKBENCH_MAX_ENTRIES,
  WORKBENCH_TOTAL_BYTES,
  abortQuietly,
  resetWorkbenchDatabase,
  transactionDone,
  validTraceMetadata,
  workbenchDatabase,
} from './workbenchSchema'
import type { StoreState, TraceMetadata } from './workbenchSchema'

/** Rebuilds accounting from small metadata rows and removes malformed or over-budget entries. */
export async function rebuildLedger(transaction: IDBTransaction): Promise<void> {
  const entries = transaction.objectStore(ENTRIES)
  const traces = transaction.objectStore(TRACES)
  let bytes = 0
  let count = 0
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = entries.openCursor()
    cursorRequest.onerror = () =>
      reject(cursorRequest.error ?? new Error('Workbench storage failed'))
    cursorRequest.onsuccess = () => {
      try {
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
      } catch (error) {
        reject(error)
      }
    }
  })
  if (bytes > WORKBENCH_TOTAL_BYTES || count > WORKBENCH_MAX_ENTRIES) {
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = entries.index(RANK_INDEX).openCursor()
      cursorRequest.onerror = () =>
        reject(cursorRequest.error ?? new Error('Workbench storage failed'))
      cursorRequest.onsuccess = () => {
        try {
          const cursor = cursorRequest.result
          if (!cursor || (bytes <= WORKBENCH_TOTAL_BYTES && count <= WORKBENCH_MAX_ENTRIES))
            return resolve()
          const row = cursor.value as TraceMetadata
          bytes -= row.bytes
          count--
          traces.delete(row.key)
          cursor.delete()
          cursor.continue()
        } catch (error) {
          reject(error)
        }
      }
    })
  }
  transaction.objectStore(STATE).put({ key: 'total', bytes, count } satisfies StoreState)
}

/** Repairs metadata accounting in an isolated transaction after a corrupt row aborts a write. */
export async function repairLedger(): Promise<boolean> {
  let transaction: IDBTransaction | null = null
  try {
    const db = await workbenchDatabase()
    transaction = db.transaction([TRACES, ENTRIES, STATE], 'readwrite')
    const done = transactionDone(transaction)
    done.catch(() => undefined)
    await rebuildLedger(transaction)
    await done
    return true
  } catch {
    abortQuietly(transaction)
    resetWorkbenchDatabase()
    return false
  }
}

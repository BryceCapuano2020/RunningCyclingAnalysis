import type { ActivityTrace } from '@rca/core/workbench'
import {
  ENTRIES,
  OWNERS,
  RANK_INDEX,
  STATE,
  TRACES,
  WORKBENCH_ENTRY_BYTES,
  WORKBENCH_MAX_ENTRIES,
  WORKBENCH_TOTAL_BYTES,
  abortQuietly,
  activityTraceBytes,
  entryKey,
  parseBoundedTrace,
  requestResult,
  resetWorkbenchDatabase,
  scopeKey,
  subtractMetadata,
  transactionDone,
  validStoreState,
  validTraceMetadata,
  workbenchDatabase,
} from './workbenchSchema'
import type {
  PutResult,
  StoreState,
  StoredTrace,
  TraceMetadata,
  TraceScope,
} from './workbenchSchema'
import { repairLedger } from './workbenchLedger'

/**
 * Keeps the trace of an activity that started at `startMs`, in one transaction that evicts the
 * recordings of the oldest activities to make room. See WorkbenchStore.put for the results.
 *
 * Nothing the transaction deleted survives an abort, so a trace that cannot fit leaves the cache as
 * it was. The abort also happens on a throw, so a failure half way through the evictions cannot
 * commit them without the new recording.
 */
export async function putTrace(
  scope: TraceScope,
  input: ActivityTrace,
  startMs: number,
): Promise<PutResult> {
  return writeTrace(scope, input, startMs, false)
}

async function writeTrace(
  scope: TraceScope,
  input: ActivityTrace,
  startMs: number,
  repaired: boolean,
): Promise<PutResult> {
  let transaction: IDBTransaction | null = null
  /** A cache that cannot account for itself is rebuilt once; a second failure refuses the trace. */
  const retry = async (): Promise<PutResult> =>
    !repaired && (await repairLedger()) ? writeTrace(scope, input, startMs, true) : 'refused'
  try {
    const trace = parseBoundedTrace(input)
    if (!trace || trace.activityId !== input.activityId || !Number.isFinite(startMs))
      return 'refused'
    const bytes = activityTraceBytes(trace)
    if (bytes > WORKBENCH_ENTRY_BYTES) return 'refused'
    const db = await workbenchDatabase()
    const opened = db.transaction([TRACES, ENTRIES, STATE, OWNERS], 'readwrite')
    transaction = opened
    const done = transactionDone(opened)
    done.catch(() => undefined)
    const key = entryKey(scope, trace.activityId)
    const entries = opened.objectStore(ENTRIES)
    const traces = opened.objectStore(TRACES)
    const stateStore = opened.objectStore(STATE)
    const owners = opened.objectStore(OWNERS)
    if (scope.kind === 'account' && (await requestResult(owners.get(scopeKey(scope))))) {
      opened.abort()
      await done.catch(() => undefined)
      return 'refused'
    }
    const [prior, stateRow] = await Promise.all([
      requestResult(entries.get(key)) as Promise<unknown>,
      requestResult(stateStore.get('total')) as Promise<unknown>,
    ])
    const ledger = validStoreState(stateRow) ? stateRow : null
    const adjusted = prior === undefined ? ledger : subtractMetadata(ledger, prior)
    if (adjusted === null) {
      opened.abort()
      await done.catch(() => undefined)
      return retry()
    }
    let totalBytes = adjusted.bytes
    let count = adjusted.count
    const mustEvict = () =>
      totalBytes + bytes > WORKBENCH_TOTAL_BYTES || count >= WORKBENCH_MAX_ENTRIES
    let corruptCandidate = false
    // Set when the next recording to drop is of a newer activity than this one, which stays.
    let outranked = false
    if (mustEvict()) {
      const cursorRequest = entries.index(RANK_INDEX).openCursor()
      await new Promise<void>((resolve, reject) => {
        cursorRequest.onerror = () =>
          reject(cursorRequest.error ?? new Error('Workbench storage failed'))
        cursorRequest.onsuccess = () => {
          // A throw here would leave the request unanswered, and the serial queue behind it stuck.
          try {
            const cursor = cursorRequest.result
            if (!cursor || !mustEvict() || corruptCandidate) return resolve()
            if (!validTraceMetadata(cursor.value)) {
              corruptCandidate = true
              return resolve()
            }
            const candidate = cursor.value
            if (candidate.key !== key) {
              if (candidate.startMs > startMs) {
                outranked = true
                return resolve()
              }
              traces.delete(candidate.key)
              totalBytes -= candidate.bytes
              count--
              cursor.delete()
            }
            cursor.continue()
          } catch (error) {
            reject(error)
          }
        }
      })
    }
    if (corruptCandidate || !Number.isSafeInteger(totalBytes) || totalBytes < 0 || count < 0) {
      opened.abort()
      await done.catch(() => undefined)
      return retry()
    }
    if (mustEvict()) {
      // Aborting undoes the evictions, so the cache is as it was. Running out of older recordings
      // without being outranked means the ledger is wrong.
      opened.abort()
      await done.catch(() => undefined)
      return outranked ? 'outranked' : retry()
    }
    const row: TraceMetadata = {
      key,
      scopeKey: scopeKey(scope),
      activityId: trace.activityId,
      startMs,
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
    return 'stored'
  } catch {
    abortQuietly(transaction)
    resetWorkbenchDatabase()
    return 'refused'
  }
}

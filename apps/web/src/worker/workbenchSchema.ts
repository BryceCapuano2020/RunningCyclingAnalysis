import { parseActivityTrace } from '@rca/core/workbench'
import type { ActivityTrace } from '@rca/core/workbench'
export type TraceScope = { kind: 'device' } | { kind: 'account'; userId: string }

export const WORKBENCH_TOTAL_BYTES = 64 * 1024 * 1024
export const WORKBENCH_ENTRY_BYTES = 12 * 1024 * 1024
export const WORKBENCH_MAX_ENTRIES = 10_000

const DB_NAME = 'rca-workbench-evidence'
const DB_VERSION = 2
export const TRACES = 'traces'
export const ENTRIES = 'entries'
export const STATE = 'state'
export const OWNERS = 'owners'

export interface StoredTrace {
  key: string
  trace: ActivityTrace
}

export interface TraceMetadata {
  key: string
  scopeKey: string
  activityId: string
  savedAt: number
  bytes: number
}

export interface StoreState {
  key: 'total'
  bytes: number
  count: number
}

export function validTraceMetadata(value: unknown): value is TraceMetadata {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<TraceMetadata>
  return (
    typeof row.key === 'string' &&
    typeof row.scopeKey === 'string' &&
    (row.scopeKey === 'device' || row.scopeKey.startsWith('account:')) &&
    typeof row.activityId === 'string' &&
    row.activityId.length > 0 &&
    row.key === JSON.stringify([row.scopeKey, row.activityId]) &&
    Number.isFinite(row.savedAt) &&
    (row.savedAt as number) >= 0 &&
    Number.isInteger(row.bytes) &&
    (row.bytes as number) >= 0 &&
    (row.bytes as number) <= WORKBENCH_ENTRY_BYTES
  )
}

export function validStoreState(value: unknown): value is StoreState {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<StoreState>
  return (
    row.key === 'total' &&
    Number.isInteger(row.bytes) &&
    (row.bytes as number) >= 0 &&
    (row.bytes as number) <= WORKBENCH_TOTAL_BYTES &&
    Number.isInteger(row.count) &&
    (row.count as number) >= 0 &&
    (row.count as number) <= WORKBENCH_MAX_ENTRIES
  )
}

/** Returns null rather than letting corrupt metadata poison cache accounting. */
export function subtractMetadata(state: unknown, metadata: unknown): StoreState | null {
  if (!validStoreState(state) || !validTraceMetadata(metadata) || state.count < 1) return null
  const bytes = state.bytes - metadata.bytes
  if (!Number.isSafeInteger(bytes) || bytes < 0) return null
  return { key: 'total', bytes, count: state.count - 1 }
}

export function scopeKey(scope: TraceScope): string {
  return scope.kind === 'device' ? 'device' : `account:${scope.userId}`
}

export function entryKey(scope: TraceScope, activityId: string): string {
  return JSON.stringify([scopeKey(scope), activityId])
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Workbench storage failed'))
  })
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Workbench storage failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Workbench storage aborted'))
  })
}

/** Bounds structured-clone input before the core parser walks or clones any arrays. */
export function parseBoundedTrace(value: unknown): ActivityTrace | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const streams = row.streams
  const laps = row.laps
  if (typeof streams !== 'object' || streams === null || !Array.isArray(laps)) return null
  const arrays = [row.distance, row.paused, row.unrecorded, ...Object.values(streams)]
  let bytes = 0
  for (const array of arrays) {
    if (array instanceof Float64Array) bytes += array.byteLength
    else if (array instanceof Float32Array) bytes += array.byteLength
    else if (array instanceof Uint8Array) bytes += array.byteLength
    else return null
    if (bytes > WORKBENCH_ENTRY_BYTES) return null
  }
  for (const lap of laps) {
    if (typeof lap !== 'object' || lap === null) return null
    const label = (lap as { label?: unknown }).label
    if (label !== undefined && typeof label !== 'string') return null
    bytes += 32 + (typeof label === 'string' ? label.length * 2 : 0)
    if (bytes > WORKBENCH_ENTRY_BYTES) return null
  }
  return parseActivityTrace(value)
}

export function activityTraceBytes(trace: ActivityTrace): number {
  return (
    trace.distance.byteLength +
    trace.paused.byteLength +
    trace.unrecorded.byteLength +
    Object.values(trace.streams).reduce((sum, stream) => sum + (stream?.byteLength ?? 0), 0) +
    (trace.cadenceUnit?.length ?? 0) * 2 +
    trace.laps.reduce((sum, lap) => sum + 32 + (lap.label?.length ?? 0) * 2, 0)
  )
}

function makeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const transaction = request.transaction!
      const traces = db.objectStoreNames.contains(TRACES)
        ? transaction.objectStore(TRACES)
        : db.createObjectStore(TRACES, { keyPath: 'key' })
      const entries = db.objectStoreNames.contains(ENTRIES)
        ? transaction.objectStore(ENTRIES)
        : db.createObjectStore(ENTRIES, { keyPath: 'key' })
      if (!entries.indexNames.contains('scopeKey'))
        entries.createIndex('scopeKey', 'scopeKey', { unique: false })
      if (!entries.indexNames.contains('savedAt'))
        entries.createIndex('savedAt', 'savedAt', { unique: false })
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(OWNERS))
        db.createObjectStore(OWNERS, { keyPath: 'scopeKey' })

      // Version 1 stored metadata beside each full trace. Move just its small accounting fields.
      if (db.version > 1 && transaction.objectStore(TRACES).keyPath === 'key') {
        const cursorRequest = traces.openCursor()
        let bytes = 0
        let count = 0
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) {
            transaction.objectStore(STATE).put({ key: 'total', bytes, count } satisfies StoreState)
            return
          }
          const row = cursor.value as {
            key?: unknown
            scopeKey?: unknown
            activityId?: unknown
            savedAt?: unknown
            bytes?: unknown
            trace?: unknown
          }
          const trace = parseBoundedTrace(row.trace)
          if (
            typeof row.key === 'string' &&
            typeof row.scopeKey === 'string' &&
            typeof row.activityId === 'string' &&
            Number.isInteger(row.bytes) &&
            (row.bytes as number) >= 0 &&
            (row.bytes as number) <= WORKBENCH_ENTRY_BYTES &&
            trace !== null &&
            trace.activityId === row.activityId &&
            activityTraceBytes(trace) === row.bytes
          ) {
            entries.put({
              key: row.key,
              scopeKey: row.scopeKey,
              activityId: row.activityId,
              savedAt: typeof row.savedAt === 'number' ? row.savedAt : 0,
              bytes: row.bytes as number,
            } satisfies TraceMetadata)
            cursor.update({ key: row.key, trace } satisfies StoredTrace)
            bytes += row.bytes as number
            count++
          } else {
            cursor.delete()
          }
          cursor.continue()
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Workbench storage failed'))
  })
}

let opened: Promise<IDBDatabase> | null = null

export function workbenchDatabase(): Promise<IDBDatabase> {
  opened ??= makeDatabase()
    .then((db) => {
      db.onversionchange = () => {
        db.close()
        opened = null
      }
      db.onclose = () => {
        opened = null
      }
      return db
    })
    .catch((error) => {
      opened = null
      throw error
    })
  return opened
}

export function resetWorkbenchDatabase(): void {
  const current = opened
  opened = null
  void current?.then((db) => db.close()).catch(() => undefined)
}

import { parseActivityTrace } from '@rca/core/workbench'
import type { ActivityTrace } from '@rca/core/workbench'
import { openDatabase, WorkbenchOpenError } from './workbenchOpen'
export { WorkbenchOpenError } from './workbenchOpen'
export type TraceScope = { kind: 'device' } | { kind: 'account'; userId: string }

export const WORKBENCH_TOTAL_BYTES = 64 * 1024 * 1024
export const WORKBENCH_ENTRY_BYTES = 12 * 1024 * 1024
export const WORKBENCH_MAX_ENTRIES = 10_000

export const DB_NAME = 'rca-workbench-evidence'
const DB_VERSION = 3
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
  /** When the activity started. The cache drops the oldest activities' recordings first. */
  startMs: number
  /** When the recording was stored or last opened. It orders recordings of activities that start together. */
  savedAt: number
  bytes: number
}

/** What storing a recording came to: kept, left out because the cache is full of newer ones, or refused. */
export type PutResult = 'stored' | 'outranked' | 'refused'

/** The index that lists recordings from the oldest activity to the newest. */
export const RANK_INDEX = 'rank'

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
    Number.isFinite(row.startMs) &&
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

/**
 * Resolves when the transaction commits, and rejects when it fails or aborts. A caller that can throw
 * before it awaits the result should also call `.catch(() => undefined)` on it, so that an abort
 * nobody is waiting for yet is not reported as an unhandled rejection.
 */
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Workbench storage failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Workbench storage aborted'))
  })
}

/** Aborts a transaction that may already be over; either way it can no longer commit. */
export function abortQuietly(transaction: IDBTransaction | null): void {
  try {
    transaction?.abort()
  } catch {
    // Already finished or aborted.
  }
}

/** Bounds structured-clone input before the core parser walks or clones any arrays. */
export function parseBoundedTrace(value: unknown): ActivityTrace | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const streams = row.streams
  const laps = row.laps
  if (typeof streams !== 'object' || streams === null || !Array.isArray(laps)) return null
  const unusable = row.unusable
  if (unusable !== undefined && (typeof unusable !== 'object' || unusable === null)) return null
  const arrays = [
    row.distance,
    row.paused,
    row.unrecorded,
    ...Object.values(streams),
    ...Object.values(unusable ?? {}),
    ...(row.zoneSpeed === undefined ? [] : [row.zoneSpeed]),
  ]
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
    Object.values(trace.unusable ?? {}).reduce((sum, mask) => sum + mask.byteLength, 0) +
    (trace.zoneSpeed?.byteLength ?? 0) +
    Object.values(trace.streams).reduce((sum, stream) => sum + (stream?.byteLength ?? 0), 0) +
    (trace.cadenceUnit?.length ?? 0) * 2 +
    trace.laps.reduce((sum, lap) => sum + 32 + (lap.label?.length ?? 0) * 2, 0)
  )
}

/**
 * The recordings are a cache, so a database from before they were ranked by activity start is
 * emptied and rebuilt rather than migrated. The tombstones of deleted accounts are kept.
 */
function upgradeDatabase(request: IDBOpenDBRequest): void {
  const db = request.result
  const transaction = request.transaction!
  const ranked =
    db.objectStoreNames.contains(ENTRIES) &&
    transaction.objectStore(ENTRIES).indexNames.contains(RANK_INDEX)
  if (!ranked) {
    for (const name of [TRACES, ENTRIES, STATE]) {
      if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name)
    }
    db.createObjectStore(TRACES, { keyPath: 'key' })
    const entries = db.createObjectStore(ENTRIES, { keyPath: 'key' })
    entries.createIndex('scopeKey', 'scopeKey', { unique: false })
    entries.createIndex(RANK_INDEX, ['startMs', 'savedAt'], { unique: false })
    db.createObjectStore(STATE, { keyPath: 'key' }).put({
      key: 'total',
      bytes: 0,
      count: 0,
    } satisfies StoreState)
  }
  if (!db.objectStoreNames.contains(OWNERS)) db.createObjectStore(OWNERS, { keyPath: 'scopeKey' })
}

let opened: Promise<IDBDatabase> | null = null
/** After a failed open, later calls fail the same way at once, so a stalled open is not waited on again for every activity. */
const OPEN_RETRY_MS = 30_000
let failed: { error: unknown; until: number; fresh: boolean } | null = null

/**
 * The open database. Reads and writes fail at once while a recent open has failed. `fresh` is for
 * what must remove recordings, which must not be told it succeeded because storage is backing off,
 * so it opens again once after a failure of a read or write. A failure of a fresh open stops later
 * ones too, so a stalled upgrade costs one wait per back-off window, and they fail closed.
 */
export function workbenchDatabase(fresh = false): Promise<IDBDatabase> {
  if (failed !== null && Date.now() < failed.until && !(fresh && !failed.fresh))
    return Promise.reject(failed.error)
  failed = null
  opened ??= openDatabase(DB_NAME, DB_VERSION, upgradeDatabase)
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
      if (error instanceof WorkbenchOpenError)
        failed = { error, until: Date.now() + OPEN_RETRY_MS, fresh }
      throw error
    })
  return opened
}

export function resetWorkbenchDatabase(): void {
  const current = opened
  opened = null
  void current?.then((db) => db.close()).catch(() => undefined)
}

import { snapshotIsCurrent } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { openIndexedDb } from './openIndexedDb'
import { databaseExists } from './workbenchExists'

const DB_NAME = 'rca-state'
const STORE = 'snapshots'

/** The scope of the library a signed-out visitor keeps in this browser. An account's scope is its user id. */
export const DEVICE_STATE_SCOPE = 'device'

/** One scope's last snapshot, the device copy of its results (docs/design/server-compute.md, decision 7). */
interface StateRow {
  scope: string
  snapshot: StateSnapshot
}

function openDatabase(): Promise<IDBDatabase | null> {
  return openIndexedDb(DB_NAME, (db) => {
    db.createObjectStore(STORE, { keyPath: 'scope' })
  })
}

/** Whether the database exists, so a read or a sweep never makes it. False when storage cannot say. */
async function stateExists(): Promise<boolean> {
  try {
    return typeof indexedDB !== 'undefined' && (await databaseExists(DB_NAME))
  } catch {
    return false
  }
}

/** Runs `work` on the store in one transaction and resolves its result, or `fallback` when storage refuses. */
async function inStore<R>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => R,
  fallback: R,
): Promise<R> {
  const db = await openDatabase()
  if (db === null) return fallback
  try {
    return await new Promise<R>((resolve) => {
      const transaction = db.transaction(STORE, mode)
      const result = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = transaction.onabort = () => resolve(fallback)
    })
  } catch {
    return fallback
  } finally {
    db.close()
  }
}

/**
 * The last snapshot of a scope, or null when there is none, storage refuses, or the snapshot is not this build's. A
 * snapshot of another shape (`STATE_SNAPSHOT_VERSION`) or model is deleted, since nothing will ever read it. Never rejects.
 */
export async function readSnapshot(scope: string): Promise<StateSnapshot | null> {
  if (!(await stateExists())) return null
  const found = await inStore<{ row: StateRow | undefined }>(
    'readonly',
    (store) => {
      const out: { row: StateRow | undefined } = { row: undefined }
      const request = store.get(scope) as IDBRequest<StateRow | undefined>
      request.onsuccess = () => (out.row = request.result)
      return out
    },
    { row: undefined },
  )
  const snapshot = found.row?.snapshot
  if (snapshot === undefined) return null
  if (snapshotIsCurrent(snapshot) && typeof snapshot.nowMs === 'number') return snapshot
  await clearSnapshot(scope)
  return null
}

/** Keeps `snapshot` as the scope's copy, replacing the last. Resolves whether it was kept. */
export function writeSnapshot(scope: string, snapshot: StateSnapshot): Promise<boolean> {
  return inStore(
    'readwrite',
    (store) => {
      store.put({ scope, snapshot } satisfies StateRow)
      return true
    },
    false,
  )
}

/** Removes a scope's copy: sign-out, a deleted account, a library that is gone. Resolves whether it did. */
export async function clearSnapshot(scope: string): Promise<boolean> {
  if (!(await stateExists())) return true
  return inStore(
    'readwrite',
    (store) => {
      store.delete(scope)
      return true
    },
    false,
  )
}

/**
 * Removes the copy of every account but `keepScope` (none when nobody is signed in), so a shared browser never
 * hands one person's results to another. The device's copy stays. Nothing is swept for an empty scope. Best effort;
 * never rejects.
 */
export async function sweepSnapshots(keepScope: string | null): Promise<void> {
  if (keepScope === '' || !(await stateExists())) return
  await inStore(
    'readwrite',
    (store) => {
      const cursor = store.openKeyCursor()
      cursor.onsuccess = () => {
        const at = cursor.result
        if (at === null) return
        if (at.primaryKey !== DEVICE_STATE_SCOPE && at.primaryKey !== keepScope)
          store.delete(at.primaryKey)
        at.continue()
      }
      return true
    },
    false,
  )
}

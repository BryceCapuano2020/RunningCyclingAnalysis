import { liftSetKey } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { openIndexedDb } from './openIndexedDb'
import {
  ackRow,
  deleteSet,
  holdRow,
  lackedRow,
  pulledRow,
  refuseRow,
  rowId,
  saveSet,
} from './liftTransitions'
import type { LiftRow, RowChange } from './liftTransitions'

const DB_NAME = 'rca-lifts'
const STORE = 'rows'

/** How long an open that failed is left alone before the next call tries it again. */
const RETRY_OPEN_AFTER_MS = 30_000

/** The lift sets of one scope (`device`, or a user id) in this browser. Never rejects: storage that refuses holds nothing. */
export interface LiftStore {
  /** Logs a set: the row waits to be sent. Resolves whether it was kept. */
  save(set: LiftSet): Promise<boolean>
  /** Deletes a set by its key. */
  remove(key: string): Promise<void>
  /** Every row of the scope, in no particular order. */
  list(): Promise<LiftRow[]>
  /** Rows not yet confirmed (put or delete): what sign-out warns about. */
  pendingCount(): Promise<number>
  /** Sign-out: the scope's synced rows go, its unsent rows stay for the next sign-in. */
  signOut(): Promise<void>
  /** The server took the send of `rev`; applies only if the row still holds that rev. */
  applyAck(key: string, rev: number, liftRevision: number): Promise<void>
  /** The server refused the send of `rev`. Resolves how many rows had logged-but-unsaved values (a put with nothing confirmed) go. */
  applyRefused(sends: readonly SentRow[]): Promise<number>
  /** The send of `rev` failed: the row is held, attempts + 1. */
  applyHeld(sends: readonly SentRow[]): Promise<void>
  /** Removes a row, only if it still holds `rev` (a device row once an account has it). */
  settle(key: string, rev: number): Promise<void>
  /** Applies a whole pull in one pass; `complete` lets it remove rows the pull lacks. */
  applyPull(items: readonly LiftSet[], liftRevision: number, complete: boolean): Promise<void>
}

export interface SentRow {
  key: string
  rev: number
}

function openDatabase(): Promise<IDBDatabase | null> {
  return openIndexedDb(DB_NAME, (db) => {
    db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('scope', 'scope')
  })
}

/** Runs `work` on the rows store in one write transaction; resolves `fallback` when storage refuses. */
async function inDatabase<R>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => R,
  fallback: R,
): Promise<R> {
  try {
    return await new Promise<R>((resolve) => {
      const transaction = db.transaction(STORE, mode)
      const result = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => resolve(fallback)
      transaction.onabort = () => resolve(fallback)
    })
  } catch {
    return fallback
  }
}

/** Removes every row of every scope, for Remove all. Resolves whether it did; missing storage holds nothing. */
export async function clearLifts(): Promise<boolean> {
  const db = await openDatabase()
  if (db === null) return true
  try {
    return await new Promise<boolean>((resolve) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).clear()
      transaction.oncomplete = () => resolve(true)
      transaction.onerror = () => resolve(false)
      transaction.onabort = () => resolve(false)
    })
  } catch {
    return false
  } finally {
    db.close()
  }
}

/**
 * Removes the rows of every scope but `keepScope`, unsent ones included: a shared browser must not hand one person's
 * log to another. Nothing is swept for an empty scope. Best effort; never rejects.
 */
export async function sweepLifts(keepScope: string | null): Promise<void> {
  if (keepScope === null || keepScope === '') return
  const db = await openDatabase()
  if (db === null) return
  try {
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const cursor = transaction.objectStore(STORE).openCursor()
      cursor.onsuccess = () => {
        const at = cursor.result
        if (at === null) return
        if ((at.value as LiftRow).scope !== keepScope) at.delete()
        at.continue()
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch {
    // The rows stay until a later load tries again.
  } finally {
    db.close()
  }
}

export function openLiftStore(scope: string): LiftStore {
  let opened: Promise<IDBDatabase | null> | null = null
  let failedAt: number | null = null
  const database = (): Promise<IDBDatabase | null> => {
    if (failedAt !== null && Date.now() - failedAt >= RETRY_OPEN_AFTER_MS) {
      opened = null
      failedAt = null
    }
    opened ??= openDatabase().then((db) => {
      if (db === null) failedAt = Date.now()
      return db
    })
    return opened
  }
  const base = (key: string) => ({ id: rowId(scope, key), scope, key })

  /** Reads each row and applies `change` to it in the transaction that writes it, so an answer meets the row as it is now. */
  const mutate = async (
    keys: readonly string[],
    change: (row: LiftRow | undefined, key: string) => RowChange,
  ): Promise<RowChange[]> => {
    const db = await database()
    if (db === null) return []
    const changes: RowChange[] = []
    return inDatabase(
      db,
      'readwrite',
      (store) => {
        for (const key of keys) {
          const read = store.get(rowId(scope, key)) as IDBRequest<LiftRow | undefined>
          read.onsuccess = () => {
            const next = change(read.result, key)
            changes.push(next)
            if (next === null) store.delete(rowId(scope, key))
            else if (next !== undefined) store.put(next)
          }
        }
        return changes
      },
      changes,
    )
  }
  const mine = async (): Promise<LiftRow[]> => {
    const db = await database()
    if (db === null) return []
    const rows: LiftRow[] = []
    return inDatabase(
      db,
      'readonly',
      (store) => {
        const all = store.index('scope').getAll(scope) as IDBRequest<LiftRow[]>
        all.onsuccess = () => rows.push(...all.result)
        return rows
      },
      rows,
    )
  }
  const sentKeys = (sends: readonly SentRow[]) => sends.map((sent) => sent.key)
  const revOf = (sends: readonly SentRow[], key: string) =>
    sends.find((sent) => sent.key === key)?.rev ?? -1

  return {
    save: async (set) => {
      const key = liftSetKey(set)
      return (await mutate([key], (row) => saveSet(row, base(key), set))).length === 1
    },
    remove: async (key) => void (await mutate([key], (row) => deleteSet(row))),
    list: mine,
    pendingCount: async () => (await mine()).filter((row) => row.state !== 'synced').length,
    signOut: async () => {
      const synced = (await mine()).filter((row) => row.state === 'synced')
      await mutate(
        synced.map((row) => row.key),
        (row) => (row?.state === 'synced' ? null : undefined),
      )
    },
    applyAck: async (key, rev, liftRevision) =>
      void (await mutate([key], (row) => ackRow(row, rev, liftRevision))),
    applyRefused: async (sends) => {
      const changes = await mutate(sentKeys(sends), (row, key) => refuseRow(row, revOf(sends, key)))
      return changes.filter((change) => change === null).length
    },
    applyHeld: async (sends) =>
      void (await mutate(sentKeys(sends), (row, key) => holdRow(row, revOf(sends, key)))),
    settle: async (key, rev) =>
      void (await mutate([key], (row) =>
        row !== undefined && row.rev === rev ? null : undefined,
      )),
    applyPull: async (items, liftRevision, complete) => {
      const db = await database()
      if (db === null) return
      await inDatabase(
        db,
        'readwrite',
        (store) => {
          const all = store.index('scope').getAll(scope) as IDBRequest<LiftRow[]>
          all.onsuccess = () => {
            const existing = new Map(all.result.map((row) => [row.key, row]))
            const seen = new Set<string>()
            const write = (key: string, next: RowChange) => {
              if (next === null) store.delete(rowId(scope, key))
              else if (next !== undefined) store.put(next)
            }
            for (const set of items) {
              const key = liftSetKey(set)
              seen.add(key)
              write(key, pulledRow(existing.get(key), base(key), set, liftRevision))
            }
            if (complete)
              for (const [key, row] of existing)
                if (!seen.has(key)) write(key, lackedRow(row, liftRevision))
          }
          return undefined
        },
        undefined,
      )
    },
  }
}

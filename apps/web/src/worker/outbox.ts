import { parseDigest, serializeDigest } from '@rca/core/digest'
import type { ActivityDigest } from '@rca/core/types'
import { workoutKeyOf } from './device'

/**
 * What a signed-in import has begun to save to the account and not yet been told is saved, kept in this
 * browser (database `rca-outbox`) so that a reload, a crash or a lost connection does not lose it. A row
 * holds the activity's summary (its digest) and the name and hash of its file, never the file or its route.
 * It is written before the save starts and removed once the server has the activity.
 */
export interface OutboxRow {
  id: string
  userId: string
  key: string
  /** The order rows were written in, so a resumed save goes the way the import did. */
  seq: number
  digestJson: string
  fileName: string
  fileHash: string
  /** How many times a resumed save failed. A row that keeps failing is let go. */
  attempts: number
}

/** After this many failed resumes a row is dropped: the athlete is told to add the file again. */
export const MAX_ATTEMPTS = 5

export interface OutboxItem {
  digest: ActivityDigest
  fileName: string
  fileHash: string
}

export interface Outbox {
  /** Writes the row. Resolves either way: where storage refuses, the save simply is not resumable. */
  add(item: OutboxItem): Promise<void>
  /** The server has the activity (or will never take it): the row goes. */
  done(key: string): Promise<void>
  /** A resumed save failed and may be tried again; the row goes after MAX_ATTEMPTS. Resolves whether it was let go. */
  failed(key: string): Promise<boolean>
  /** The rows waiting, in the order they were written. */
  pending(): Promise<OutboxRow[]>
  /** Every row of this account goes. */
  forget(): Promise<void>
}

/** A row's digest, or null when it no longer reads (an older format): such a row cannot be resumed. */
export function digestOf(row: OutboxRow): ActivityDigest | null {
  try {
    return parseDigest(row.digestJson)
  } catch {
    return null
  }
}

const DB_NAME = 'rca-outbox'
const STORE = 'rows'

/** How many rows are waiting for the account, without opening the outbox for writing. 0 where storage is not offered. */
export async function waitingCount(userId: string): Promise<number> {
  return (await openOutbox(userId).pending()).length
}

/** The outbox of one account in IndexedDB. Never rejects: storage that is missing or refuses holds nothing. */
export function openOutbox(userId: string): Outbox {
  let opened: Promise<IDBDatabase | null> | null = null
  let counter = Date.now()
  const database = (): Promise<IDBDatabase | null> => {
    opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('userId', 'userId')
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
        request.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    return opened
  }
  const run = async <T, F>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
    fallback: F,
  ): Promise<T | F> => {
    const db = await database()
    if (db === null) return fallback
    try {
      return await new Promise<T | F>((resolve) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(fallback)
      })
    } catch {
      opened = null
      return fallback
    }
  }
  const idOf = (key: string) => `${userId}|${key}`
  const mine = async (): Promise<OutboxRow[]> =>
    (
      await run(
        'readonly',
        (store) => store.index('userId').getAll(userId) as IDBRequest<OutboxRow[]>,
        [] as OutboxRow[],
      )
    ).sort((a, b) => a.seq - b.seq)
  return {
    add: async ({ digest, fileName, fileHash }) => {
      const key = workoutKeyOf(digest)
      const row: OutboxRow = {
        id: idOf(key),
        userId,
        key,
        seq: counter++,
        digestJson: serializeDigest(digest),
        fileName,
        fileHash,
        attempts: 0,
      }
      await run('readwrite', (store) => store.put(row), undefined)
    },
    done: async (key) => {
      await run('readwrite', (store) => store.delete(idOf(key)), undefined)
    },
    failed: async (key) => {
      const row = await run(
        'readonly',
        (store) => store.get(idOf(key)) as IDBRequest<OutboxRow | undefined>,
        undefined,
      )
      if (row === undefined) return false
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await run('readwrite', (store) => store.delete(row.id), undefined)
        return true
      }
      await run(
        'readwrite',
        (store) => store.put({ ...row, attempts: row.attempts + 1 }),
        undefined,
      )
      return false
    },
    pending: mine,
    forget: async () => {
      for (const row of await mine())
        await run('readwrite', (store) => store.delete(row.id), undefined)
    },
  }
}

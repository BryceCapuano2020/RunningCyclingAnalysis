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
  /** The id of the digest the row holds, so a save settles only the row it sent (a re-added file replaces the row). */
  digestId: string
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
  /**
   * The server has the activity (or will never take it): the row goes. With `digestId`, only if the row still holds
   * that digest, checked in the transaction that removes it, so a row written again meanwhile stays.
   */
  done(key: string, digestId?: string): Promise<void>
  /**
   * A save was refused and may be tried again; the row goes after MAX_ATTEMPTS. Resolves whether it was let go.
   * With `digestId`, only the row that holds that digest is counted.
   */
  failed(key: string, digestId?: string): Promise<boolean>
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

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
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
}

/**
 * Removes every waiting save of every account from this browser, for Remove all: it means nothing kept here stays,
 * and a signed-out visitor has no account on screen to ask about the rows an expired session left. Resolves whether
 * it did; storage that is missing holds nothing.
 */
export async function clearOutbox(): Promise<boolean> {
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
 * Removes the waiting saves of every account but the signed-in one: a session that ended by itself, or an account
 * deleted on another device, leaves its rows (summaries and file names) behind, and the next person to sign in on a
 * shared browser must not inherit them. Nothing is swept while nobody is signed in: the rows of a session that
 * expired wait for that account's next sign-in, and Remove all clears them for good. Best effort: what storage refuses
 * is tried again at the next load. Never rejects.
 */
export async function sweepOutbox(keepUserId: string | null): Promise<void> {
  if (keepUserId === null) return
  const db = await openDatabase()
  if (db === null) return
  try {
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const cursor = transaction.objectStore(STORE).openCursor()
      cursor.onsuccess = () => {
        const at = cursor.result
        if (at === null) return
        if ((at.value as OutboxRow).userId !== keepUserId) at.delete()
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

/** The outbox of one account in IndexedDB. Never rejects: storage that is missing or refuses holds nothing. */
export function openOutbox(userId: string): Outbox {
  let opened: Promise<IDBDatabase | null> | null = null
  let counter = Date.now()
  const database = (): Promise<IDBDatabase | null> => {
    opened ??= openDatabase()
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
  /** Reads the row and changes it in one transaction, so what is changed is the row that was read. */
  const update = async <R>(
    key: string,
    digestId: string | undefined,
    change: (store: IDBObjectStore, row: OutboxRow) => R,
    fallback: R,
  ): Promise<R> => {
    const db = await database()
    if (db === null) return fallback
    try {
      return await new Promise<R>((resolve) => {
        const transaction = db.transaction(STORE, 'readwrite')
        const store = transaction.objectStore(STORE)
        let result = fallback
        const read = store.get(idOf(key)) as IDBRequest<OutboxRow | undefined>
        read.onsuccess = () => {
          const row = read.result
          if (row !== undefined && (digestId === undefined || row.digestId === digestId))
            result = change(store, row)
        }
        transaction.oncomplete = () => resolve(result)
        transaction.onerror = () => resolve(fallback)
        transaction.onabort = () => resolve(fallback)
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
        digestId: digest.id,
        seq: counter++,
        digestJson: serializeDigest(digest),
        fileName,
        fileHash,
        attempts: 0,
      }
      await run('readwrite', (store) => store.put(row), undefined)
    },
    done: async (key, digestId) => {
      await update(key, digestId, (store, row) => void store.delete(row.id), undefined)
    },
    failed: (key, digestId) =>
      update(
        key,
        digestId,
        (store, row) => {
          if (row.attempts + 1 >= MAX_ATTEMPTS) {
            store.delete(row.id)
            return true
          }
          store.put({ ...row, attempts: row.attempts + 1 })
          return false
        },
        false,
      ),
    pending: mine,
    forget: async () => {
      for (const row of await mine())
        await run('readwrite', (store) => store.delete(row.id), undefined)
    },
  }
}

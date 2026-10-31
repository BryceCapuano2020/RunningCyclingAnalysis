import { databaseExists } from './workbenchExists'

/**
 * What this browser remembers between imports, kept in one database, `rca-checkin`, with every store created at
 * version 1 so that no later change needs a version bump:
 *
 *  - `held`: a local index of the files already read, key `<scope>|<sha-256>`, so a re-import can leave a known file
 *    unparsed (see heldIndex.ts);
 *  - `marks`, `seen`: the baseline of "since your last import" and what the athlete has seen of it, key `<scope>`.
 *
 * A scope is `device` for the library kept in this browser and `account:<userId>` for a signed-in account. Nothing
 * here leaves the browser, and every use is best effort: storage that cannot be opened is no index and no baseline,
 * which behaves as a first visit.
 */
export const CHECKIN_DB = 'rca-checkin'
export const CHECKIN_STORES = ['marks', 'seen', 'held'] as const
export type CheckinStore = (typeof CHECKIN_STORES)[number]

export type CheckinScope = 'device' | `account:${string}`

export const accountScope = (userId: string): CheckinScope => `account:${userId}`

/** The key of a scope's epoch in the `marks` store: a count of how many times the scope has been cleared. */
export const epochKey = (scope: CheckinScope): string => `${scope}|epoch`

let opening: Promise<IDBDatabase | null> | null = null

/** The database, or null where storage cannot be opened (a private window, a blocked or refused open). */
export function openCheckinDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(CHECKIN_DB, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      for (const name of CHECKIN_STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Another tab upgrading or deleting the database must not be held up by this connection.
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      resolve(db)
    }
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  }).then((db) => {
    if (db === null) opening = null
    return db
  })
  return opening
}

/** Forgets the open connection, for a test that replaces the whole of IndexedDB. */
export function resetCheckinDb(): void {
  opening = null
}

function settle(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true)
    transaction.onerror = () => resolve(false)
    transaction.onabort = () => resolve(false)
  })
}

/** The key range of a scope's rows in a store keyed `<scope>|<rest>`. */
export const scopeRange = (scope: CheckinScope): IDBKeyRange =>
  IDBKeyRange.bound(`${scope}|`, `${scope}|￿`)

/** Removes everything the scope has in the database. Resolves false when storage refused. */
export async function clearCheckinScope(scope: CheckinScope): Promise<boolean> {
  // Clearing must not make a database for a visitor who never imported.
  if (typeof indexedDB === 'undefined' || !(await databaseExists(CHECKIN_DB))) return true
  const db = await openCheckinDb()
  if (db === null) return true
  try {
    const tx = db.transaction([...CHECKIN_STORES], 'readwrite')
    const marks = tx.objectStore('marks')
    marks.delete(scope)
    tx.objectStore('seen').delete(scope)
    tx.objectStore('held').delete(scopeRange(scope))
    // A writer that read the scope before this clear is refused by the epoch (see checkinMarks.ts).
    const epoch = marks.get(epochKey(scope))
    epoch.onsuccess = () =>
      marks.put((typeof epoch.result === 'number' ? epoch.result : 0) + 1, epochKey(scope))
    return await settle(tx)
  } catch {
    return false
  }
}

/** The accounts the database holds anything for, so a different user's sign-in can sweep the others. */
export async function accountsWithCheckin(): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || !(await databaseExists(CHECKIN_DB))) return []
  const db = await openCheckinDb()
  if (db === null) return []
  const scopes = new Set<string>()
  try {
    const tx = db.transaction([...CHECKIN_STORES], 'readonly')
    for (const name of CHECKIN_STORES) {
      const request = tx.objectStore(name).openKeyCursor()
      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor === null) return resolve()
          // A scope's epoch is a count, not a record: it does not make the scope one that holds anything.
          if (!String(cursor.key).endsWith('|epoch')) scopes.add(String(cursor.key).split('|')[0]!)
          cursor.continue()
        }
        request.onerror = () => resolve()
      })
    }
  } catch {
    // What cannot be listed cannot be swept; the next load tries again.
  }
  return [...scopes].filter((scope) => scope.startsWith('account:'))
}

/** Clears every account's rows except the signed-in one's (or all of them with none), as the recordings are swept. */
export async function sweepCheckin(keepUserId: string | null): Promise<void> {
  for (const scope of await accountsWithCheckin()) {
    if (scope !== (keepUserId === null ? null : accountScope(keepUserId))) {
      await clearCheckinScope(scope as CheckinScope)
    }
  }
}

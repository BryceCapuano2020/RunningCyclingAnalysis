import { DB_NAME } from './workbenchSchema'

/**
 * Whether the recordings database already exists in this browser, without making it. A visitor who
 * never stored a recording has nothing to sweep, and looking must not leave a database behind.
 * Where `indexedDB.databases()` is missing, the database is opened without a version: if that
 * would create it (an upgrade from version 0), the upgrade is aborted and what was made is deleted.
 * False when storage cannot say, since the sweep is best effort.
 */
export const workbenchExists = (): Promise<boolean> => databaseExists(DB_NAME)

/** As `workbenchExists`, for any database by name. */
export async function databaseExists(name: string): Promise<boolean> {
  if (typeof indexedDB.databases === 'function') {
    try {
      return (await indexedDB.databases()).some((database) => database.name === name)
    } catch {
      // Fall through to opening it.
    }
  }
  return new Promise((resolve) => {
    let creating = false
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(name)
    } catch {
      resolve(false)
      return
    }
    request.onupgradeneeded = (event) => {
      if (event.oldVersion !== 0) return
      creating = true
      request.transaction?.abort()
    }
    request.onsuccess = () => {
      request.result.close()
      if (creating) indexedDB.deleteDatabase(name)
      resolve(!creating)
    }
    request.onerror = () => {
      if (creating) indexedDB.deleteDatabase(name)
      resolve(false)
    }
    request.onblocked = () => resolve(false)
  })
}

import type { ImportManifest, ManifestScope } from './importManifest'

export interface ManifestStore {
  all(): Promise<ImportManifest[]>
  /** Records an import that begins, and forgets the oldest of its library beyond the ones kept. */
  put(manifest: ImportManifest): Promise<void>
  /**
   * Rewrites a record the store still holds. One that was forgotten meanwhile (another tab removed the
   * library) stays gone: the import going on here must not bring its file names back. When the record ends,
   * the oldest beyond the ones kept go too.
   */
  update(manifest: ImportManifest): Promise<void>
  /** Forgets these records. */
  remove(ids: readonly string[]): Promise<void>
  /** Forgets every manifest of the scope: its library was removed. */
  forget(scope: ManifestScope): Promise<void>
}

/** How many manifests a scope keeps. Older ones are forgotten. */
const KEPT_PER_SCOPE = 5

const DB_NAME = 'rca-import-meta'
const STORE = 'manifests'

/** Deletes the oldest records of the scope beyond the ones kept, within the transaction `store` belongs to. */
function prune(store: IDBObjectStore, scope: ManifestScope): void {
  const all = store.getAll() as IDBRequest<ImportManifest[]>
  all.onsuccess = () => {
    const mine = all.result
      .filter((manifest) => manifest.scope === scope)
      .sort((a, b) => b.startedAt - a.startedAt)
    for (const old of mine.slice(KEPT_PER_SCOPE)) store.delete(old.id)
  }
}

/** The store in IndexedDB. Never rejects: an unavailable or refusing store lists nothing and keeps nothing. */
export function openManifestStore(): ManifestStore {
  let opened: Promise<IDBDatabase | null> | null = null
  const database = (): Promise<IDBDatabase | null> => {
    opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
        request.onsuccess = () => {
          const db = request.result
          // Never stand in the way of another tab deleting or upgrading the database.
          db.onversionchange = () => {
            db.close()
            opened = null
          }
          resolve(db)
        }
        request.onerror = () => resolve(null)
        request.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    return opened
  }
  /** Runs `work` in one transaction and settles when the transaction ends, however it ends. */
  const transact = async (
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => void,
  ): Promise<void> => {
    const db = await database()
    if (db === null) return
    try {
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(STORE, mode)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
        transaction.onabort = () => resolve()
        work(transaction.objectStore(STORE))
      })
    } catch {
      opened = null
    }
  }
  return {
    all: async () => {
      let rows: ImportManifest[] = []
      await transact('readonly', (store) => {
        const request = store.getAll() as IDBRequest<ImportManifest[]>
        request.onsuccess = () => {
          rows = request.result
        }
      })
      return rows
    },
    put: (manifest) =>
      transact('readwrite', (store) => {
        store.put(manifest)
        prune(store, manifest.scope)
      }),
    update: (manifest) =>
      transact('readwrite', (store) => {
        const held = store.getKey(manifest.id)
        held.onsuccess = () => {
          if (held.result === undefined) return
          store.put(manifest)
          if (manifest.state !== 'running') prune(store, manifest.scope)
        }
      }),
    remove: (ids) =>
      transact('readwrite', (store) => {
        for (const id of ids) store.delete(id)
      }),
    forget: (scope) =>
      transact('readwrite', (store) => {
        const all = store.getAll() as IDBRequest<ImportManifest[]>
        all.onsuccess = () => {
          for (const manifest of all.result) if (manifest.scope === scope) store.delete(manifest.id)
        }
      }),
  }
}

/**
 * What an import was meant to read and how far it got, kept in this browser (database `rca-import-meta`)
 * so that after a reload, a crash or a damaged zip the page can say the library is not the whole history,
 * instead of stating a verdict from a part of it. Everything here is best effort: where storage is refused
 * the import runs as it always did, without the record.
 */

export type ManifestState =
  /** The import is going on, in the tab that holds its lock. */
  | 'running'
  | 'complete'
  /** It stopped before it finished: the tab closed or crashed, the worker failed, or the athlete stopped it. */
  | 'interrupted'
  /** It ran to the end, but a zip in it is damaged, so files in it were not read. */
  | 'partial-source'
  /** The athlete chose to go on with what the library holds. */
  | 'accepted-partial'
  /** A later import of the same files finished. */
  | 'superseded'

/** The library an import went into: the one kept in this browser, or an account's. */
export type ManifestScope = 'device' | `account:${string}`

export interface ManifestSource {
  name: string
  size: number
}

/** A zip that could not be read to its end. `lost` is the files the damage cost, when its directory says. */
export interface DamagedSource {
  name: string
  lost: number | null
}

export interface ImportManifest {
  id: string
  scope: ManifestScope
  startedAt: number
  updatedAt: number
  sources: ManifestSource[]
  /** Activity files the sources hold, when the import has counted them. */
  expected: number | null
  /** Activity files read so far. */
  read: number
  damaged: DamagedSource[]
  state: ManifestState
}

/** How many manifests a scope keeps. Older ones are forgotten. */
const KEPT_PER_SCOPE = 5

/** Without Web Locks, a running manifest not written for this long belongs to an import that is gone. */
export const STALE_MS = 30_000

/** The states that tell the athlete their library may be only part of their history. */
export function isIncomplete(manifest: ImportManifest): boolean {
  return manifest.state === 'interrupted' || manifest.state === 'partial-source'
}

export function lockName(id: string): string {
  return `rca-import-${id}`
}

/**
 * Which running manifests belong to an import that is no longer going on, as `interrupted`. With the
 * names of the locks held (`held`), a running import is alive while its lock is held, by any tab. Where
 * the browser has no locks (`held` is null), one that has not been written for STALE_MS is not.
 */
export function reconciled(
  manifests: readonly ImportManifest[],
  held: ReadonlySet<string> | null,
  now: number,
): ImportManifest[] {
  return manifests.map((manifest) => {
    if (manifest.state !== 'running') return manifest
    const alive =
      held === null ? now - manifest.updatedAt <= STALE_MS : held.has(lockName(manifest.id))
    return alive ? manifest : { ...manifest, state: 'interrupted' }
  })
}

/**
 * The manifest to tell the athlete about: the latest of the scope that is incomplete and has not been
 * accepted or replaced. Null when the library is as complete as the record knows.
 */
export function incompleteOf(
  manifests: readonly ImportManifest[],
  scope: ManifestScope,
): ImportManifest | null {
  const mine = manifests
    .filter((manifest) => manifest.scope === scope)
    .sort((a, b) => b.startedAt - a.startedAt)
  const latest = mine.find((manifest) => manifest.state !== 'running')
  return latest !== undefined && isIncomplete(latest) ? latest : null
}

/** Whether `later` read every source `earlier` did, by name and size, so finishing it makes `earlier` whole. */
export function covers(later: ImportManifest, earlier: ImportManifest): boolean {
  return earlier.sources.every((source) =>
    later.sources.some(({ name, size }) => name === source.name && size === source.size),
  )
}

/** The manifests with those a finished import covers marked superseded. */
export function withSuperseded(
  manifests: readonly ImportManifest[],
  finished: ImportManifest,
): ImportManifest[] {
  return manifests.map((manifest) =>
    manifest.id !== finished.id &&
    manifest.scope === finished.scope &&
    isIncomplete(manifest) &&
    covers(finished, manifest)
      ? { ...manifest, state: 'superseded' }
      : manifest,
  )
}

export interface ManifestStore {
  all(): Promise<ImportManifest[]>
  put(manifest: ImportManifest): Promise<void>
  /** Forgets every manifest of the scope: its library was removed. */
  forget(scope: ManifestScope): Promise<void>
}

const DB_NAME = 'rca-import-meta'
const STORE = 'manifests'

/** The store in IndexedDB. Never rejects: an unavailable or refusing store lists nothing and keeps nothing. */
export function openManifestStore(): ManifestStore {
  let opened: Promise<IDBDatabase | null> | null = null
  const database = (): Promise<IDBDatabase | null> => {
    opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
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
  return {
    all: () => run('readonly', (store) => store.getAll() as IDBRequest<ImportManifest[]>, []),
    put: async (manifest) => {
      await run('readwrite', (store) => store.put(manifest), undefined)
      const mine = (
        await run('readonly', (store) => store.getAll() as IDBRequest<ImportManifest[]>, [])
      )
        .filter(({ scope }) => scope === manifest.scope)
        .sort((a, b) => b.startedAt - a.startedAt)
      for (const old of mine.slice(KEPT_PER_SCOPE)) {
        await run('readwrite', (store) => store.delete(old.id), undefined)
      }
    },
    forget: async (scope) => {
      const mine = (
        await run('readonly', (store) => store.getAll() as IDBRequest<ImportManifest[]>, [])
      ).filter((manifest) => manifest.scope === scope)
      for (const manifest of mine)
        await run('readwrite', (store) => store.delete(manifest.id), undefined)
    },
  }
}

/** The names of the locks held by any tab, or null where the browser has no locks to ask. */
export async function heldLockNames(): Promise<Set<string> | null> {
  try {
    const locks = navigator.locks as LockManager | undefined
    if (locks === undefined) return null
    const { held } = await locks.query()
    return new Set((held ?? []).flatMap(({ name }) => (name === undefined ? [] : [name])))
  } catch {
    return null
  }
}

/**
 * Takes the lock that says this import is alive and keeps it until the returned function is called, or the
 * tab goes. The browser frees a lock whose tab died, which is how a later page load tells an import that
 * finished from one that was cut off. Where there are no locks, the function does nothing.
 */
export function holdLock(id: string): () => void {
  let release: () => void = () => undefined
  let released = false
  try {
    const locks = navigator.locks as LockManager | undefined
    if (locks === undefined) return release
    void locks
      .request(
        lockName(id),
        { mode: 'exclusive' },
        () =>
          new Promise<void>((resolve) => {
            // Freed before the browser granted it: nothing to hold.
            if (released) resolve()
            else release = resolve
          }),
      )
      .catch(() => undefined)
  } catch {
    // No lock: liveness falls back to when the record was last written.
  }
  return () => {
    released = true
    release()
  }
}

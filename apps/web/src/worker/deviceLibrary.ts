import { DIGEST_VERSION, parseDigest, serializeDigest } from '@rca/core/digest'
import { parseRouteShape } from '@rca/core/route/routeShape'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest } from '@rca/core/types'

/**
 * Activity digests kept in this browser for a signed-out visitor, so a reload keeps their results.
 * Nothing here leaves the device. There is one entry per workout, keyed by sport and start second;
 * the caller decides which copy of a workout to keep.
 */
export interface DeviceLibrary {
  /**
   * Every readable entry. A row that does not read, such as one a newer version of the app wrote,
   * is skipped and kept, so a tab on an older build never deletes it.
   */
  all(): Promise<DeviceEntry[]>
  /**
   * Every readable entry, as `all` lists them, except that a read that fails on a database that did
   * open rejects instead of listing nothing. Storage that cannot be opened at all lists nothing, since
   * nothing could have been kept there. For a caller that must tell an empty library from an unread one.
   */
  allStrict(): Promise<DeviceEntry[]>
  get(workoutKey: string): Promise<ActivityDigest | null>
  /**
   * As `get`, but says why a row does not read. 'newer' is a digest written in a format later than this
   * version's (its own `version`), which an older build must leave alone; 'unreadable' is any other
   * row that does not read, which is damaged or from an older format. Null is no row at all. Unlike
   * `get`, it rejects when the read fails on storage that opened, so a failed read is not taken for no row.
   */
  lookup(workoutKey: string): Promise<ActivityDigest | 'newer' | 'unreadable' | null>
  /** The route shape kept with the digest, or null when none was kept or it does not read. */
  route(workoutKey: string): Promise<RouteShape | null>
  /** Keeps a digest with its route, which goes with it. A replacement without a route keeps none. */
  put(workoutKey: string, digest: ActivityDigest, route?: RouteShape | null): Promise<void>
  remove(workoutKey: string): Promise<void>
  clear(): Promise<void>
}

export interface DeviceEntry {
  workoutKey: string
  digest: ActivityDigest
}

const DB_NAME = 'rca-device-library'
const STORE = 'digests'

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Device storage failed'))
  })
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Device storage failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Device storage aborted'))
  })
}

/**
 * Digests are kept in the same JSON form the server stores, so the numbers a digest leaves
 * undefined (NaN) survive and are checked the same way on the way back. Anything that no longer
 * reads as a digest is not used.
 */
function readDigest(value: unknown): ActivityDigest | null {
  if (typeof value !== 'string') return null
  try {
    return parseDigest(value)
  } catch {
    return null
  }
}

/** Whether a stored row holds a digest in a format later than this version reads. */
function fromNewerVersion(value: unknown): boolean {
  const json =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && 'digest' in value
        ? value.digest
        : null
  if (typeof json !== 'string') return false
  try {
    const parsed: unknown = JSON.parse(json)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof parsed.version === 'number' &&
      parsed.version > DIGEST_VERSION
    )
  } catch {
    return false
  }
}

/**
 * A stored row: the digest and the route kept with it. A row written before routes were kept holds
 * the digest alone, and reads with no route.
 */
interface Row {
  digest: ActivityDigest
  route: RouteShape | null
}

function readRow(value: unknown): Row | null {
  if (typeof value === 'string') {
    const digest = readDigest(value)
    return digest === null ? null : { digest, route: null }
  }
  if (typeof value !== 'object' || value === null || !('digest' in value)) return null
  const digest = readDigest(value.digest)
  const route = 'route' in value ? parseRouteShape(value.route) : null
  return digest === null ? null : { digest, route }
}

/**
 * The library in IndexedDB. Storage can be missing, refused or closed by the browser (a private
 * window, a full disk, cleared site data); reads then return nothing and writes reject, and the
 * next call opens the database again.
 */
export function openDeviceLibrary(): DeviceLibrary {
  let opened: Promise<IDBDatabase | null> | null = null

  function database(): Promise<IDBDatabase | null> {
    opened ??= Promise.resolve()
      .then(() => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE)
        return done(request)
      })
      .then((db) => {
        // Another tab upgrading, or the browser closing the database, ends this connection.
        db.onversionchange = () => {
          db.close()
          opened = null
        }
        db.onclose = () => {
          opened = null
        }
        return db
      })
      .catch(() => null)
    return opened
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => Promise<T>,
    empty: T,
    strict = false,
  ): Promise<T> {
    const db = await database()
    if (db === null) {
      opened = null
      if (mode === 'readonly') return empty
      throw new Error('Device storage is unavailable')
    }
    try {
      const transaction = db.transaction(STORE, mode)
      const result = await work(transaction.objectStore(STORE))
      if (mode === 'readwrite') await committed(transaction)
      return result
    } catch (error) {
      opened = null
      if (mode === 'readonly' && !strict) return empty
      throw error
    }
  }

  const readOne = (workoutKey: string) =>
    withStore('readonly', async (store) => readRow(await done(store.get(workoutKey))), null)

  const write = (change: (store: IDBObjectStore) => void) =>
    withStore(
      'readwrite',
      async (store) => {
        change(store)
      },
      undefined,
    )

  async function entries(strict: boolean): Promise<DeviceEntry[]> {
    const rows = await withStore(
      'readonly',
      async (store) => {
        const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())])
        return keys.map((key, index) => ({ key, row: readRow(values[index]) }))
      },
      [],
      strict,
    )
    return rows.flatMap(({ key, row }) =>
      typeof key === 'string' && row !== null ? [{ workoutKey: key, digest: row.digest }] : [],
    )
  }

  return {
    all: () => entries(false),
    allStrict: () => entries(true),
    get: async (workoutKey) => (await readOne(workoutKey))?.digest ?? null,
    lookup: (workoutKey) =>
      withStore(
        'readonly',
        async (store) => {
          const stored: unknown = await done(store.get(workoutKey))
          if (stored === undefined) return null
          const digest = readRow(stored)?.digest
          if (digest !== undefined) return digest
          return fromNewerVersion(stored) ? 'newer' : 'unreadable'
        },
        null,
        // A failed read must not look like no kept copy, or a save would write over a better one.
        true,
      ),
    route: async (workoutKey) => (await readOne(workoutKey))?.route ?? null,
    put: (workoutKey, digest, route = null) =>
      write((store) => store.put({ digest: serializeDigest(digest), route }, workoutKey)),
    remove: (workoutKey) => write((store) => store.delete(workoutKey)),
    clear: () => write((store) => store.clear()),
  }
}

import { serializeDigest } from '@rca/core/digest'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest, AthleteType } from '@rca/core/types'
import { LibraryReplaced } from './deviceFile'
import type { DeviceFile } from './deviceFile'
import { fromNewerVersion, readRow } from './deviceRows'
import { commitOrThrow, requestResult, yieldToOtherTabs } from './idb'
import { OpenFailure, OPEN_TIMEOUT_MS, STORE, openDatabase } from './deviceDatabase'

export type { DeviceFile }
export { LibraryReplaced, OPEN_TIMEOUT_MS }

/**
 * Activity digests kept in this browser for a signed-out visitor, so a reload keeps their results.
 * Nothing here leaves the device. There is one entry per workout, keyed by sport and start second;
 * the caller decides which copy of a workout to keep.
 */
export interface DeviceLibrary {
  /**
   * Every readable entry. A row that does not read, such as one a newer version of the app wrote, is
   * skipped and kept, so a tab on an older build never deletes it. A read that fails on a database that
   * did open rejects, so an unread library is not taken for an empty one, and so does a database that
   * failed to open (full, blocked or hung): rows may be there. Only storage this browser does not offer,
   * as in a private window, lists nothing, since nothing could have been kept there.
   */
  all(): Promise<DeviceEntry[]>
  /**
   * How many rows the last `all()` skipped for not reading (a newer version's, or damaged). They are kept,
   * and they are why a listing with no entries is not always an empty library.
   */
  skipped(): number
  /**
   * The digest kept under a workout, or null for none. Strict as `all` and `lookup` are about a database that
   * failed to open (it rejects, since a copy may be there), and lenient about a read that fails on one that
   * did (null), as `route` is. A caller that must not claim a copy is gone, such as a removal, uses `lookup`.
   */
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
  /**
   * Keeps a digest with its route, which goes with it, and with the name and hash of the file it was made
   * from when they are given, so the workout can be added to an account later (the server needs the hash).
   * A replacement without a route keeps none, and one without a file keeps none. With an `epoch` the
   * write is refused (`LibraryReplaced`) unless the library is still in that epoch, checked in the same
   * transaction that writes: a write begun before another tab emptied the library does not bring a row
   * back into it.
   */
  put(
    workoutKey: string,
    digest: ActivityDigest,
    route?: RouteShape | null,
    file?: DeviceFile | null,
    epoch?: number,
  ): Promise<void>
  /**
   * Gives a row that has no file hash the name and hash of the file its digest was made from, keeping its
   * digest and route as they are. Only the row whose digest is `digestId` is changed, checked in the same
   * transaction that writes it, so a row replaced in between does not take another file's hash. A row that
   * already has a hash, and a workout kept nowhere, are left alone.
   */
  backfillFile(workoutKey: string, digestId: string, file: DeviceFile): Promise<void>
  /**
   * Sets or takes off the athlete's label on the digest kept under a workout (D12 section 2.4), keeping the route and
   * the file as they are. Only the row whose digest is `digestId` and that holds the label `from` now is changed,
   * checked in the same transaction that writes it, so a row replaced since (rebuilt, or by another copy), or
   * labelled otherwise by the athlete, is left alone, as the account's labels are. With an `epoch` the write is refused (`LibraryReplaced`) unless the library is still in it. True
   * when it wrote.
   */
  setLabel(
    workoutKey: string,
    digestId: string,
    change: { from: AthleteType | null; athleteType: AthleteType | null },
    epoch?: number,
  ): Promise<boolean>
  /**
   * Gives the workout the name the athlete chose, in its digest and in the row beside it, keeping the route and the file.
   * The name outlives a rebuild: `put` gives a replacing digest the name the row holds. Only the row whose digest is
   * `digestId` is changed, checked in the same transaction that writes it, so a row replaced since is left alone. With
   * an `epoch` the write is refused (`LibraryReplaced`) unless the library is still in it. True when it wrote.
   */
  setName(workoutKey: string, digestId: string, name: string, epoch?: number): Promise<boolean>
  remove(workoutKey: string): Promise<void>
  /**
   * Removes the row only if it still holds the digest `digestId`, checked in the same transaction that deletes it,
   * so a row replaced since (by another tab, or by the same file added again) is not lost. True when it removed one.
   */
  removeIfDigest(workoutKey: string, digestId: string): Promise<boolean>
  /** Empties the library, and starts a new epoch in the same transaction. */
  clear(): Promise<void>
  /**
   * The library's epoch: a number that rises each time it is emptied, kept beside its rows. A session that
   * loaded the library at one epoch writes to it only while it is still that one. Zero before any clear.
   */
  epoch(): Promise<number>
}

/**
 * Where the epoch is kept: a reserved key in the same store, so one transaction covers it and the rows. It
 * is not a workout key (those are a sport and a second), and no listing, lookup or count includes it.
 */
const SCOPE_KEY = '__scope__'

function epochOf(stored: unknown): number {
  if (typeof stored !== 'object' || stored === null || !('epoch' in stored)) return 0
  return typeof stored.epoch === 'number' && Number.isInteger(stored.epoch) && stored.epoch > 0
    ? stored.epoch
    : 0
}

export interface DeviceEntry {
  workoutKey: string
  digest: ActivityDigest
  /** The file the digest was made from, absent for a row kept before files were recorded. */
  file?: DeviceFile
}

const done = <T>(request: IDBRequest<T>): Promise<T> => requestResult(request, 'Device storage')

/**
 * The library in IndexedDB. Storage can be missing, refused or closed by the browser (a private
 * window, a full disk, cleared site data); the next call opens the database again. Storage this
 * browser does not offer reads as empty and refuses writes. Storage that failed to open refuses both,
 * a listing and a lookup included, since it may hold rows that a read must not report as none.
 */
export function openDeviceLibrary(): DeviceLibrary {
  let opened: Promise<IDBDatabase | OpenFailure> | null = null
  let lastSkipped = 0

  function database(): Promise<IDBDatabase | OpenFailure> {
    opened ??= openDatabase().then(
      (db) => {
        // Another tab upgrading, or the browser closing the database, ends this connection.
        yieldToOtherTabs(db, () => (opened = null), true)
        return db
      },
      (error: unknown) =>
        error instanceof OpenFailure ? error : new OpenFailure(String(error), 'failed'),
    )
    return opened
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => Promise<T>,
    empty: T,
    strict = false,
  ): Promise<T> {
    const db = await database()
    if (db instanceof OpenFailure) {
      opened = null
      // Storage the browser does not offer holds nothing; a database that failed to open may hold anything.
      if (mode === 'readonly' && db.kind === 'unavailable') return empty
      throw new Error(
        db.kind === 'failed'
          ? `Device storage did not open: ${db.message}`
          : 'Device storage is unavailable',
      )
    }
    try {
      const transaction = db.transaction(STORE, mode)
      const result = await work(transaction.objectStore(STORE))
      if (mode === 'readwrite') await commitOrThrow(transaction, 'Device storage')
      return result
    } catch (error) {
      // A refused write is the library's news, not a fault in the connection.
      if (error instanceof LibraryReplaced) throw error
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

  async function entries(): Promise<DeviceEntry[]> {
    const rows = await withStore(
      'readonly',
      async (store) => {
        const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())])
        return keys.flatMap((key, index) =>
          key === SCOPE_KEY ? [] : [{ key, row: readRow(values[index]) }],
        )
      },
      [],
      true,
    )
    lastSkipped = rows.filter(({ row }) => row === null).length
    return rows.flatMap(({ key, row }) =>
      typeof key === 'string' && row !== null
        ? [
            {
              workoutKey: key,
              digest: row.digest,
              ...(row.file === null ? {} : { file: row.file }),
            },
          ]
        : [],
    )
  }

  return {
    all: entries,
    skipped: () => lastSkipped,
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
    put: (workoutKey, digest, route = null, file = null, epoch) =>
      withStore(
        'readwrite',
        async (store) => {
          if (epoch !== undefined && epochOf(await done(store.get(SCOPE_KEY))) !== epoch) {
            throw new LibraryReplaced()
          }
          // The name the athlete gave the workout stays with it when a rebuilt or re-imported digest replaces its row.
          const named = readRow(await done(store.get(workoutKey)))?.nameOverride ?? null
          store.put(
            {
              digest: serializeDigest(named === null ? digest : { ...digest, name: named }),
              route,
              ...(file ?? {}),
              ...(named === null ? {} : { nameOverride: named }),
            },
            workoutKey,
          )
        },
        undefined,
      ),
    backfillFile: (workoutKey, digestId, file) =>
      withStore(
        'readwrite',
        async (store) => {
          const stored: unknown = await done(store.get(workoutKey))
          const row = readRow(stored)
          if (row === null || row.digest.id !== digestId || row.file !== null) return
          store.put(
            typeof stored === 'string'
              ? { digest: stored, route: null, ...file }
              : { ...(stored as object), ...file },
            workoutKey,
          )
        },
        undefined,
      ),
    setLabel: (workoutKey, digestId, { from, athleteType }, epoch) =>
      withStore(
        'readwrite',
        async (store) => {
          if (epoch !== undefined && epochOf(await done(store.get(SCOPE_KEY))) !== epoch) {
            throw new LibraryReplaced()
          }
          const stored: unknown = await done(store.get(workoutKey))
          const row = readRow(stored)
          if (row === null || row.digest.id !== digestId) return false
          if ((row.digest.athleteType ?? null) !== from) return false
          const { athleteType: _was, ...rest } = row.digest
          const next = athleteType === null ? rest : { ...rest, athleteType }
          const json = serializeDigest(next)
          store.put(
            typeof stored === 'string'
              ? { digest: json, route: null }
              : { ...(stored as object), digest: json },
            workoutKey,
          )
          return true
        },
        false,
      ),
    setName: (workoutKey, digestId, name, epoch) =>
      withStore(
        'readwrite',
        async (store) => {
          if (epoch !== undefined && epochOf(await done(store.get(SCOPE_KEY))) !== epoch) {
            throw new LibraryReplaced()
          }
          const stored: unknown = await done(store.get(workoutKey))
          const row = readRow(stored)
          if (row === null || row.digest.id !== digestId) return false
          const json = serializeDigest({ ...row.digest, name })
          store.put(
            typeof stored === 'string'
              ? { digest: json, route: null, nameOverride: name }
              : { ...(stored as object), digest: json, nameOverride: name },
            workoutKey,
          )
          return true
        },
        false,
      ),
    remove: (workoutKey) => write((store) => store.delete(workoutKey)),
    removeIfDigest: (workoutKey, digestId) =>
      withStore(
        'readwrite',
        async (store) => {
          const row = readRow(await done(store.get(workoutKey)))
          if (row === null || row.digest.id !== digestId) return false
          store.delete(workoutKey)
          return true
        },
        false,
      ),
    clear: () =>
      withStore(
        'readwrite',
        async (store) => {
          const next = epochOf(await done(store.get(SCOPE_KEY))) + 1
          store.clear()
          store.put({ epoch: next }, SCOPE_KEY)
        },
        undefined,
      ),
    epoch: () =>
      withStore('readonly', async (store) => epochOf(await done(store.get(SCOPE_KEY))), 0, true),
  }
}

import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import type { FileId, HeldFiles } from '@rca/core/session'
import { openCheckinDb, scopeRange } from './checkinStore'
import type { CheckinScope } from './checkinStore'

/** What the index remembers of a file already read. The file's own name is not kept: the library says which file holds a workout. */
export interface HeldEntry {
  size: number
  /** The workout keys of every activity the file held when it was read. */
  keys: string[]
  /** The model revision of the digests made from it. */
  revision: number
  /** A signature of what the export's list said of its workouts (see metaOf): never the names themselves. */
  meta: string
}

/** An import of at least this many files reads the scope's whole index at once; a shorter one asks for each hash. */
export const HELD_BULK_FILES = 300
/** Entries written in one batch while an import runs; the rest wait for the end. */
const FLUSH_AT = 200

export interface HeldIndexHandle {
  files: HeldFiles
  /** Writes what the import learned. Best effort; resolves false when storage refused. */
  flush(): Promise<boolean>
}

/** An index that knows nothing and learns nothing: storage is unavailable. */
const INERT: HeldIndexHandle = {
  files: { skip: () => Promise.resolve(null), note: () => undefined },
  flush: () => Promise.resolve(true),
}

function request<T>(r: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => resolve(undefined)
  })
}

const isEntry = (value: unknown): value is HeldEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as HeldEntry).size === 'number' &&
  Array.isArray((value as HeldEntry).keys) &&
  typeof (value as HeldEntry).revision === 'number' &&
  typeof (value as HeldEntry).meta === 'string'

/**
 * Opens the index of one scope for one import. `fileCount` is how many files the import will read (null when not
 * known); a short import asks the database for each hash, a long one reads the scope's index once. `allows` says,
 * for the workouts a file held, whether skipping it loses nothing the worker owes them (a recording, an original).
 * The core checks the rest against the library.
 */
export async function openHeldIndex(options: {
  scope: CheckinScope
  fileCount: number | null
  allows: (keys: readonly string[]) => Promise<boolean>
}): Promise<HeldIndexHandle> {
  const { scope, fileCount, allows } = options
  const db = await openCheckinDb()
  if (db === null) return INERT
  const bulk = fileCount === null || fileCount >= HELD_BULK_FILES
  const memory = new Map<string, HeldEntry>()
  const pending = new Map<string, HeldEntry>()
  const key = (hash: string) => `${scope}|${hash}`

  if (bulk) {
    await new Promise<void>((resolve) => {
      try {
        const cursor = db
          .transaction('held', 'readonly')
          .objectStore('held')
          .openCursor(scopeRange(scope))
        const prefix = `${scope}|`.length
        cursor.onsuccess = () => {
          const at = cursor.result
          if (at === null) return resolve()
          if (isEntry(at.value)) memory.set(String(at.key).slice(prefix), at.value)
          at.continue()
        }
        cursor.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  const entryOf = async (hash: string): Promise<HeldEntry | undefined> => {
    const known = memory.get(hash)
    if (known !== undefined || bulk) return known
    try {
      const stored = await request(
        db.transaction('held', 'readonly').objectStore('held').get(key(hash)),
      )
      return isEntry(stored) ? stored : undefined
    } catch {
      return undefined
    }
  }

  const handle: HeldIndexHandle = {
    files: {
      async skip(file: FileId) {
        const entry = await entryOf(file.hash)
        if (
          entry === undefined ||
          entry.revision !== MODEL_REVISION ||
          entry.size !== file.size ||
          entry.keys.length === 0
        ) {
          return null
        }
        return (await allows(entry.keys)) ? { keys: entry.keys, meta: entry.meta } : null
      },
      note(file: FileId, keys: readonly string[], meta: string) {
        const entry: HeldEntry = {
          size: file.size,
          keys: [...keys],
          revision: MODEL_REVISION,
          meta,
        }
        memory.set(file.hash, entry)
        pending.set(file.hash, entry)
        if (pending.size >= FLUSH_AT) void handle.flush()
      },
    },
    async flush() {
      if (pending.size === 0) return true
      const batch = [...pending]
      pending.clear()
      try {
        const tx = db.transaction('held', 'readwrite')
        const store = tx.objectStore('held')
        for (const [hash, entry] of batch) store.put(entry, key(hash))
        return await new Promise<boolean>((resolve) => {
          tx.oncomplete = () => resolve(true)
          tx.onerror = () => resolve(false)
          tx.onabort = () => resolve(false)
        })
      } catch {
        return false
      }
    },
  }
  return handle
}

/** Removes the entries of the scope whose file held any of these workouts, so a deleted activity's file is read again. */
export async function forgetHeldKeys(scope: CheckinScope, keys: readonly string[]): Promise<void> {
  const db = await openCheckinDb()
  if (db === null || keys.length === 0) return
  const drop = new Set(keys)
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction('held', 'readwrite')
      const cursor = tx.objectStore('held').openCursor(scopeRange(scope))
      cursor.onsuccess = () => {
        const at = cursor.result
        if (at === null) return
        if (isEntry(at.value) && at.value.keys.some((k) => drop.has(k))) at.delete()
        at.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

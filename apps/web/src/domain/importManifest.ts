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
  /** The tab that ran the import (see tabId), so a reload of that tab knows what it left behind. */
  tabId?: string
  /** At most MAX_SOURCES; see summariseSources. */
  sources: ManifestSource[]
  /** How many more files the import was given than `sources` lists, for a drop of thousands of loose files. */
  moreSources?: number
  /** Activity files the sources hold, when the import has counted them. */
  expected: number | null
  /** Activity files read so far. */
  read: number
  damaged: DamagedSource[]
  state: ManifestState
}

/** The most files whose names and sizes one manifest keeps, so a drop of thousands of loose files stays small. */
export const MAX_SOURCES = 50

/** How often a running import's record is written even when no file was read, so a long phase is not read as dead. */
export const HEARTBEAT_MS = 10_000

/** Without Web Locks, a running manifest not written for this long belongs to an import that is gone. */
export const STALE_MS = 30_000

/** The states that tell the athlete their library may be only part of their history. */
export function isIncomplete(manifest: ImportManifest): boolean {
  return manifest.state === 'interrupted' || manifest.state === 'partial-source'
}

/**
 * What a manifest keeps of the files an import was given: the zips first (the sources that matter when a
 * download is cut short), then the rest, up to MAX_SOURCES.
 */
export function summariseSources(files: readonly { name: string; size: number }[]): {
  sources: ManifestSource[]
  moreSources?: number
} {
  const isZip = ({ name }: { name: string }) => /\.zip$/i.test(name)
  const ordered = [...files.filter(isZip), ...files.filter((file) => !isZip(file))]
  const sources = ordered.slice(0, MAX_SOURCES).map(({ name, size }) => ({ name, size }))
  return ordered.length > MAX_SOURCES
    ? { sources, moreSources: ordered.length - MAX_SOURCES }
    : { sources }
}

const TAB_KEY = 'rca.importTab.v1'
let memoryTabId: string | null = null

/**
 * An id for this browser tab that survives a reload of it (session storage lives as long as the tab), so a
 * page can recognise the imports its own earlier page began. Where session storage is refused it is the page's.
 */
export function tabId(): string {
  try {
    const kept = sessionStorage.getItem(TAB_KEY)
    if (kept !== null && kept !== '') return kept
    memoryTabId ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(TAB_KEY, memoryTabId)
  } catch {
    memoryTabId ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  return memoryTabId
}

export function lockName(id: string): string {
  return `rca-import-${id}`
}

/**
 * Which running manifests belong to an import that is no longer going on, as `interrupted`. With the
 * names of the locks held (`held`), a running import is alive while its lock is held, by any tab. Where
 * the browser has no locks (`held` is null), one that has not been written for STALE_MS is not, and neither is
 * one this tab (`ownTab`) began in an earlier page: a page that has just loaded cannot be running it.
 */
export function reconciled(
  manifests: readonly ImportManifest[],
  held: ReadonlySet<string> | null,
  now: number,
  ownTab: string | null = null,
): ImportManifest[] {
  return manifests.map((manifest) => {
    if (manifest.state !== 'running') return manifest
    const alive =
      held === null
        ? now - manifest.updatedAt <= STALE_MS && (ownTab === null || manifest.tabId !== ownTab)
        : held.has(lockName(manifest.id))
    return alive ? manifest : { ...manifest, state: 'interrupted' }
  })
}

/**
 * The imports of the scope that left its library short and have not been accepted or replaced, the latest first.
 * A later import that finished does not hide an earlier one that was cut off, unless it made it whole (withSuperseded).
 */
export function incompleteIn(
  manifests: readonly ImportManifest[],
  scope: ManifestScope,
): ImportManifest[] {
  return manifests
    .filter((manifest) => manifest.scope === scope && isIncomplete(manifest))
    .sort((a, b) => b.startedAt - a.startedAt)
}

/** The manifest to tell the athlete about: the latest of the scope that is incomplete. Null when none is. */
export function incompleteOf(
  manifests: readonly ImportManifest[],
  scope: ManifestScope,
): ImportManifest | null {
  return incompleteIn(manifests, scope)[0] ?? null
}

/**
 * Whether `later` read every source `earlier` did, by name and size, so finishing it makes `earlier` whole.
 * An earlier import given more files than its record lists cannot be matched by name.
 */
export function covers(later: ImportManifest, earlier: ImportManifest): boolean {
  return (
    (earlier.moreSources ?? 0) === 0 &&
    earlier.sources.every((source) =>
      later.sources.some(({ name, size }) => name === source.name && size === source.size),
    )
  )
}

/**
 * The manifests with those a finished import makes whole marked superseded: it read the same sources, or it
 * read at least as many files as the earlier one was meant to (a zip downloaded again, of another size).
 */
export function withSuperseded(
  manifests: readonly ImportManifest[],
  finished: ImportManifest,
): ImportManifest[] {
  return manifests.map((manifest) =>
    manifest.id !== finished.id &&
    manifest.scope === finished.scope &&
    isIncomplete(manifest) &&
    (covers(finished, manifest) ||
      (manifest.expected !== null && finished.read >= manifest.expected))
      ? { ...manifest, state: 'superseded' }
      : manifest,
  )
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

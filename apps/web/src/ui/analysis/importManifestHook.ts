import { useCallback, useEffect, useRef, useState } from 'react'
import {
  heldLockNames,
  HEARTBEAT_MS,
  holdLock,
  incompleteIn,
  incompleteOf,
  reconciled,
  summariseSources,
  tabId,
  withSuperseded,
} from '../importManifest'
import type { DamagedSource, ImportManifest, ManifestScope } from '../importManifest'
import { openManifestStore } from '../importManifestStore'
import type { ManifestStore } from '../importManifestStore'

/** The least time between two writes of an import's progress. */
const WRITE_EVERY_MS = 2_000

export interface ImportManifestController {
  /** The latest import that left the library short of the whole history, or null. */
  incomplete: ImportManifest | null
  /** An import (the worker request `requestId`) is sent: it is recorded, and its lock is taken. */
  begin: (requestId: number, files: readonly File[], scope: ManifestScope) => void
  /** The import `requestId` has read `read` of `total` activity files (total is null while unknown). */
  progress: (requestId: number, read: number, total: number | null) => void
  /** The import `requestId` ended; the zips it found damaged are listed. */
  finish: (requestId: number, damaged: DamagedSource[]) => void
  /** The import `requestId` failed, or with no number every running import was cut off (the worker is gone). */
  fail: (requestId?: number) => void
  /** The athlete goes on with what the library holds. */
  accept: () => void
  /** The scope's library was removed, so what was recorded about it goes too. */
  forget: (scope: ManifestScope) => void
}

interface Running {
  requestId: number
  manifest: ImportManifest
  release: () => void
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Records each import (see importManifest.ts) and finds, on load, the ones that were cut off. `scope` is the
 * library the page is showing, or null while that is not known. The worker's events name the request they are
 * about, which is how they find their import.
 */
export function useImportManifest(
  scope: ManifestScope | null,
  store: ManifestStore = openManifestStore(),
): ImportManifestController {
  const [manifests, setManifests] = useState<ImportManifest[]>([])
  // The same list, readable at once: several events can arrive before the next render.
  const listRef = useRef<ImportManifest[]>([])
  const running = useRef<Running[]>([])
  const wroteAt = useRef(0)
  const storeRef = useRef(store)
  // Whether an import with something read is going on, for the guard against closing the tab.
  const [guarded, setGuarded] = useState(false)

  const setList = useCallback((next: ImportManifest[]) => {
    listRef.current = next
    setManifests(next)
  }, [])

  /** Writes a record that was just begun. */
  const keepNew = useCallback(
    (manifest: ImportManifest) => {
      setList([...listRef.current.filter(({ id }) => id !== manifest.id), manifest])
      return storeRef.current.put(manifest)
    },
    [setList],
  )

  /** Rewrites a record the store still holds, and shows it. */
  const keep = useCallback(
    (manifest: ImportManifest) => {
      setList([...listRef.current.filter(({ id }) => id !== manifest.id), manifest])
      return storeRef.current.update(manifest)
    },
    [setList],
  )

  // On load, and when the library on screen changes: what earlier visits left, with the imports that died marked.
  // An account's records leave memory when it is no longer the library shown (sign-out), and come back from
  // storage at the next sign-in.
  useEffect(() => {
    let current = true
    const going = new Set(running.current.map(({ manifest }) => manifest.id))
    const shown = listRef.current.filter(
      (manifest) =>
        manifest.scope === 'device' || manifest.scope === scope || going.has(manifest.id),
    )
    if (shown.length !== listRef.current.length) setList(shown)
    void (async () => {
      const stored = await storeRef.current.all()
      const held = await heldLockNames()
      if (!current) return
      // Imports begun in this visit are ahead of what storage knew when the read started, and are not for this to judge.
      const here = listRef.current
      const others = stored.filter(({ id }) => !here.some((manifest) => manifest.id === id))
      const settled = reconciled(others, held, Date.now(), tabId())
      for (const [index, manifest] of settled.entries()) {
        if (manifest.state !== others[index]?.state) void storeRef.current.update(manifest)
      }
      setList([...settled, ...here])
    })()
    return () => {
      current = false
    }
  }, [scope, setList])

  const arm = useCallback(
    () => setGuarded(running.current.some(({ manifest }) => manifest.read > 0)),
    [],
  )

  // While any import runs, its record is written now and then even when no file is read (a long last phase, or
  // an import queued behind another), so a browser without locks does not take it for one that is gone.
  const beat = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopBeat = useCallback(() => {
    if (beat.current === null) return
    clearInterval(beat.current)
    beat.current = null
  }, [])
  const startBeat = useCallback(() => {
    beat.current ??= setInterval(() => {
      for (const entry of running.current) {
        entry.manifest = { ...entry.manifest, updatedAt: Date.now() }
        void storeRef.current.update(entry.manifest)
      }
    }, HEARTBEAT_MS)
  }, [])
  useEffect(() => stopBeat, [stopBeat])

  const begin = useCallback(
    (requestId: number, files: readonly File[], importScope: ManifestScope) => {
      const now = Date.now()
      const manifest: ImportManifest = {
        id: newId(),
        scope: importScope,
        startedAt: now,
        updatedAt: now,
        tabId: tabId(),
        ...summariseSources(files),
        expected: null,
        read: 0,
        damaged: [],
        state: 'running',
      }
      running.current.push({ requestId, manifest, release: holdLock(manifest.id) })
      void keepNew(manifest)
      startBeat()
    },
    [keepNew, startBeat],
  )

  const progress = useCallback(
    (requestId: number, read: number, total: number | null) => {
      const entry = running.current.find((other) => other.requestId === requestId)
      if (entry === undefined) return
      const now = Date.now()
      entry.manifest = {
        ...entry.manifest,
        read,
        expected: total ?? entry.manifest.expected,
        updatedAt: now,
      }
      if (now - wroteAt.current >= WRITE_EVERY_MS || read === total) {
        wroteAt.current = now
        void keep(entry.manifest)
      }
      arm()
    },
    [arm, keep],
  )

  /** Ends the imports given, with the state and the damaged zips found. */
  const end = useCallback(
    (
      ended: Running[],
      state: 'complete' | 'partial-source' | 'interrupted',
      damaged: DamagedSource[],
    ) => {
      for (const { manifest, release } of ended) {
        const finished: ImportManifest = { ...manifest, state, damaged, updatedAt: Date.now() }
        // The lock goes only once the record says how the import ended: a page loading in between would
        // otherwise find it running with no lock held, and call it cut off.
        void keep(finished).then(release)
        if (state === 'complete') {
          // What a finished import makes whole is no longer short of anything, so its file names are not kept.
          const made = withSuperseded(listRef.current, finished).filter(
            (other, index) => other.state === 'superseded' && listRef.current[index] !== other,
          )
          if (made.length > 0) {
            const gone = new Set(made.map(({ id }) => id))
            setList(listRef.current.filter(({ id }) => !gone.has(id)))
            void storeRef.current.remove([...gone])
          }
        }
      }
      if (running.current.length === 0) stopBeat()
      arm()
    },
    [arm, keep, setList, stopBeat],
  )

  const finish = useCallback(
    (requestId: number, damaged: DamagedSource[]) => {
      const at = running.current.findIndex((entry) => entry.requestId === requestId)
      if (at === -1) return
      end(
        running.current.splice(at, 1),
        damaged.length > 0 ? 'partial-source' : 'complete',
        damaged,
      )
    },
    [end],
  )
  const fail = useCallback(
    (requestId?: number) => {
      const at =
        requestId === undefined ? -1 : running.current.findIndex((e) => e.requestId === requestId)
      end(
        requestId === undefined
          ? running.current.splice(0)
          : at === -1
            ? []
            : running.current.splice(at, 1),
        'interrupted',
        [],
      )
    },
    [end],
  )

  const accept = useCallback(() => {
    if (scope === null) return
    const now = Date.now()
    for (const target of incompleteIn(listRef.current, scope)) {
      void keep({ ...target, state: 'accepted-partial', updatedAt: now })
    }
  }, [keep, scope])

  const forget = useCallback(
    (forgotten: ManifestScope) => {
      setList(listRef.current.filter((manifest) => manifest.scope !== forgotten))
      void storeRef.current.forget(forgotten)
    },
    [setList],
  )

  // Closing the tab mid-import ends it; browsers that ask first give the athlete the chance to stay.
  // (iOS Safari does not ask, which is why the record, not this, is what tells the truth afterwards.)
  useEffect(() => {
    if (!guarded) return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [guarded])

  const incomplete = scope === null ? null : incompleteOf(manifests, scope)
  return { incomplete, begin, progress, finish, fail, accept, forget }
}

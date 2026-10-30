import { useCallback, useEffect, useRef, useState } from 'react'
import {
  heldLockNames,
  holdLock,
  incompleteOf,
  openManifestStore,
  reconciled,
  withSuperseded,
} from '../importManifest'
import type { DamagedSource, ImportManifest, ManifestScope, ManifestStore } from '../importManifest'

/** The least time between two writes of an import's progress. */
const WRITE_EVERY_MS = 2_000

export interface ImportManifestController {
  /** The latest import that left the library short of the whole history, or null. */
  incomplete: ImportManifest | null
  /** A signed-in or signed-out import is sent: it is recorded, and its lock is taken. */
  begin: (files: readonly File[], scope: ManifestScope) => void
  /** The running import has read `read` of `total` activity files (total is null while unknown). */
  progress: (read: number, total: number | null) => void
  /** The running import ended; the zips it found damaged are listed. */
  finish: (damaged: DamagedSource[]) => void
  /** Every running import was cut off: the worker failed, the athlete stopped it, or the account changed. */
  fail: () => void
  /** The athlete goes on with what the library holds. */
  accept: () => void
  /** The scope's library was removed, so what was recorded about it goes too. */
  forget: (scope: ManifestScope) => void
}

interface Running {
  manifest: ImportManifest
  release: () => void
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Records each import (see importManifest.ts) and finds, on load, the ones that were cut off. `scope` is the
 * library the page is showing, or null while that is not known. Imports run one after another in the worker, so
 * the oldest running one is the one its events are about.
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

  const keep = useCallback(
    (manifest: ImportManifest) => {
      setList([...listRef.current.filter(({ id }) => id !== manifest.id), manifest])
      void storeRef.current.put(manifest)
    },
    [setList],
  )

  // On load: what earlier visits left, for every library, with the imports that died marked.
  useEffect(() => {
    let current = true
    void (async () => {
      const stored = await storeRef.current.all()
      const settled = reconciled(stored, await heldLockNames(), Date.now())
      if (!current) return
      for (const [index, manifest] of settled.entries()) {
        if (manifest.state !== stored[index]?.state) void storeRef.current.put(manifest)
      }
      // Imports begun in this visit are ahead of what storage knew when the read started.
      const here = listRef.current
      setList([...settled.filter(({ id }) => !here.some((other) => other.id === id)), ...here])
    })()
    return () => {
      current = false
    }
  }, [setList])

  const arm = useCallback(
    () => setGuarded(running.current.some(({ manifest }) => manifest.read > 0)),
    [],
  )

  const begin = useCallback(
    (files: readonly File[], importScope: ManifestScope) => {
      const now = Date.now()
      const manifest: ImportManifest = {
        id: newId(),
        scope: importScope,
        startedAt: now,
        updatedAt: now,
        sources: files.map(({ name, size }) => ({ name, size })),
        expected: null,
        read: 0,
        damaged: [],
        state: 'running',
      }
      running.current.push({ manifest, release: holdLock(manifest.id) })
      keep(manifest)
    },
    [keep],
  )

  const progress = useCallback(
    (read: number, total: number | null) => {
      const first = running.current[0]
      if (first === undefined) return
      const now = Date.now()
      first.manifest = {
        ...first.manifest,
        read,
        expected: total ?? first.manifest.expected,
        updatedAt: now,
      }
      if (now - wroteAt.current >= WRITE_EVERY_MS || read === total) {
        wroteAt.current = now
        keep(first.manifest)
      }
      arm()
    },
    [arm, keep],
  )

  /** Ends the oldest running import, or every one when they were all cut off. */
  const end = useCallback(
    (state: 'complete' | 'partial-source' | 'interrupted', damaged: DamagedSource[]) => {
      const ended =
        state === 'interrupted' ? running.current.splice(0) : running.current.splice(0, 1)
      for (const { manifest, release } of ended) {
        release()
        const finished: ImportManifest = { ...manifest, state, damaged, updatedAt: Date.now() }
        keep(finished)
        if (state === 'complete') {
          const next = withSuperseded(listRef.current, finished)
          for (const [index, other] of next.entries()) {
            if (other !== listRef.current[index]) void storeRef.current.put(other)
          }
          setList(next)
        }
      }
      arm()
    },
    [arm, keep, setList],
  )

  const finish = useCallback(
    (damaged: DamagedSource[]) => end(damaged.length > 0 ? 'partial-source' : 'complete', damaged),
    [end],
  )
  const fail = useCallback(() => end('interrupted', []), [end])

  const accept = useCallback(() => {
    const target = scope === null ? null : incompleteOf(listRef.current, scope)
    if (target !== null) keep({ ...target, state: 'accepted-partial', updatedAt: Date.now() })
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

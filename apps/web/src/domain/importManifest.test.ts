// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  covers,
  heldLockNames,
  holdLock,
  incompleteOf,
  lockName,
  MAX_SOURCES,
  reconciled,
  STALE_MS,
  summariseSources,
  tabId,
  withSuperseded,
} from './importManifest'
import type { ImportManifest } from './importManifest'
import { openManifestStore } from './importManifestStore'
import { OPEN_TIMEOUT_MS } from '../worker/openIndexedDb'

function manifest(id: string, over: Partial<ImportManifest> = {}): ImportManifest {
  return {
    id,
    scope: 'device',
    startedAt: 1_000,
    updatedAt: 1_000,
    sources: [{ name: 'export.zip', size: 10 }],
    expected: 100,
    read: 40,
    damaged: [],
    state: 'running',
    ...over,
  }
}

describe('reconciled', () => {
  it('keeps a running import alive while its lock is held, by any tab', () => {
    const list = [manifest('a')]
    expect(reconciled(list, new Set([lockName('a')]), 9_999_999)[0]?.state).toBe('running')
  })

  it('marks a running import interrupted when its lock is not held', () => {
    expect(reconciled([manifest('a')], new Set(), 1_001)[0]?.state).toBe('interrupted')
  })

  it('without locks, goes by when the record was last written', () => {
    const list = [manifest('a', { updatedAt: 1_000 })]
    expect(reconciled(list, null, 1_000 + STALE_MS)[0]?.state).toBe('running')
    expect(reconciled(list, null, 1_000 + STALE_MS + 1)[0]?.state).toBe('interrupted')
  })

  it('without locks, takes an import its own tab began in an earlier page for gone at once', () => {
    const list = [manifest('a', { updatedAt: 1_000, tabId: 't1' }), manifest('b', { tabId: 't2' })]
    expect(reconciled(list, null, 1_001, 't1').map(({ state }) => state)).toEqual([
      'interrupted',
      'running',
    ])
    // With locks, the lock decides.
    expect(reconciled(list, new Set([lockName('a')]), 1_001, 't1')[0]?.state).toBe('running')
  })

  it('leaves every other state as it is', () => {
    const list = (['complete', 'partial-source', 'accepted-partial', 'superseded'] as const).map(
      (state) => manifest(state, { state }),
    )
    expect(reconciled(list, new Set(), 9_999_999).map(({ state }) => state)).toEqual([
      'complete',
      'partial-source',
      'accepted-partial',
      'superseded',
    ])
  })
})

describe('incompleteOf', () => {
  it('is the latest import of the scope, when it left the library short', () => {
    const list = [
      manifest('old', { state: 'interrupted', startedAt: 1 }),
      manifest('new', { state: 'partial-source', startedAt: 2 }),
    ]
    expect(incompleteOf(list, 'device')?.id).toBe('new')
  })

  it('is still the cut-off import when a later one completed without making it whole', () => {
    const list = [
      manifest('old', { state: 'interrupted', startedAt: 1 }),
      manifest('new', { state: 'complete', startedAt: 2 }),
    ]
    expect(incompleteOf(list, 'device')?.id).toBe('old')
  })

  it('is nothing once the imports were accepted or replaced', () => {
    for (const state of ['accepted-partial', 'superseded'] as const) {
      expect(incompleteOf([manifest('old', { state, startedAt: 1 })], 'device')).toBeNull()
    }
  })

  it('does not count an import still running, or another library’s', () => {
    expect(incompleteOf([manifest('a')], 'device')).toBeNull()
    expect(incompleteOf([manifest('a', { state: 'interrupted' })], 'account:u1')).toBeNull()
  })
})

describe('supersession', () => {
  it('says an import covers another that read only sources it read, by name and size', () => {
    const earlier = manifest('a', { sources: [{ name: 'a.zip', size: 1 }] })
    expect(
      covers(
        manifest('b', {
          sources: [
            { name: 'a.zip', size: 1 },
            { name: 'b.zip', size: 2 },
          ],
        }),
        earlier,
      ),
    ).toBe(true)
    expect(covers(manifest('b', { sources: [{ name: 'a.zip', size: 2 }] }), earlier)).toBe(false)
    expect(covers(manifest('b', { sources: [{ name: 'c.zip', size: 1 }] }), earlier)).toBe(false)
  })

  it('does not match by name an import given more files than its record lists', () => {
    const earlier = manifest('a', { sources: [{ name: 'a.zip', size: 1 }], moreSources: 3 })
    expect(covers(manifest('b', { sources: [{ name: 'a.zip', size: 1 }] }), earlier)).toBe(false)
  })

  it('also marks an import a later one made whole by reading as many files as it was meant to', () => {
    const cut = manifest('cut', {
      state: 'interrupted',
      expected: 100,
      sources: [{ name: 'a.zip', size: 1 }],
    })
    const finishedOf = (read: number) =>
      manifest('done', { state: 'complete', read, sources: [{ name: 'again.zip', size: 2 }] })

    expect(withSuperseded([cut], finishedOf(100))[0]?.state).toBe('superseded')
    expect(withSuperseded([cut], finishedOf(99))[0]?.state).toBe('interrupted')
    expect(withSuperseded([{ ...cut, expected: null }], finishedOf(999))[0]?.state).toBe(
      'interrupted',
    )
  })

  it('marks the incomplete imports a finished one covers, in its own library only', () => {
    const cut = manifest('cut', { state: 'interrupted' })
    const other = manifest('other', { state: 'interrupted', scope: 'account:u1' })
    const unrelated = manifest('unrelated', {
      state: 'interrupted',
      sources: [{ name: 'x.zip', size: 9 }],
    })
    const finished = manifest('done', { state: 'complete', startedAt: 5 })

    const next = withSuperseded([cut, other, unrelated, finished], finished)

    expect(next.map(({ id, state }) => [id, state])).toEqual([
      ['cut', 'superseded'],
      ['other', 'interrupted'],
      ['unrelated', 'interrupted'],
      ['done', 'complete'],
    ])
  })
})

describe('summariseSources', () => {
  it('keeps every file of a small import, and the zips first of a large one, with how many more there were', () => {
    expect(summariseSources([{ name: 'a.fit', size: 1 }])).toEqual({
      sources: [{ name: 'a.fit', size: 1 }],
    })
    const loose = Array.from({ length: MAX_SOURCES + 20 }, (_, i) => ({
      name: `${i}.fit`,
      size: i,
    }))
    const summary = summariseSources([...loose, { name: 'export.zip', size: 9 }])
    expect(summary.sources).toHaveLength(MAX_SOURCES)
    expect(summary.sources[0]).toEqual({ name: 'export.zip', size: 9 })
    expect(summary.moreSources).toBe(21)
  })
})

describe('tabId', () => {
  it('is the same on every call in a tab, and kept in session storage', () => {
    const id = tabId()
    expect(id).not.toBe('')
    expect(tabId()).toBe(id)
    expect(sessionStorage.getItem('rca.importTab.v1')).toBe(id)
  })

  it('still gives an id where session storage is refused', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('refused')
      },
      setItem: () => undefined,
    })
    expect(tabId()).not.toBe('')
    vi.unstubAllGlobals()
  })
})

describe('the store', () => {
  beforeEach(async () => {
    await openManifestStore().forget('device')
    await openManifestStore().forget('account:u1')
  })

  it('keeps manifests, and forgets one library’s without touching another’s', async () => {
    const store = openManifestStore()
    await store.put(manifest('a'))
    await store.put(manifest('b', { scope: 'account:u1' }))

    expect((await store.all()).map(({ id }) => id).sort()).toEqual(['a', 'b'])
    await store.forget('device')
    expect((await store.all()).map(({ id }) => id)).toEqual(['b'])
  })

  it('replaces a manifest written again, and keeps the latest five of a library', async () => {
    const store = openManifestStore()
    for (let i = 1; i <= 7; i++) await store.put(manifest(`m${i}`, { startedAt: i }))
    await store.put(manifest('m7', { startedAt: 7, state: 'complete' }))

    const ids = (await store.all()).map(({ id }) => id).sort()
    expect(ids).toEqual(['m3', 'm4', 'm5', 'm6', 'm7'])
    expect((await store.all()).find(({ id }) => id === 'm7')?.state).toBe('complete')
  })

  it('rewrites a record it holds, and does not bring back one that was forgotten', async () => {
    const store = openManifestStore()
    await store.put(manifest('a'))
    await store.update(manifest('a', { read: 90 }))
    expect((await store.all())[0]?.read).toBe(90)

    await openManifestStore().forget('device')
    await store.update(manifest('a', { read: 95 }))
    expect(await store.all()).toEqual([])
  })

  it('forgets the oldest beyond five when an import begins, and not on every write of its progress', async () => {
    const store = openManifestStore()
    for (let i = 1; i <= 6; i++) await store.put(manifest(`m${i}`, { startedAt: i }))
    expect((await store.all()).map(({ id }) => id).sort()).toEqual(['m2', 'm3', 'm4', 'm5', 'm6'])

    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    await store.update(manifest('m6', { startedAt: 6, read: 5 }))
    expect(getAll).not.toHaveBeenCalled()
    await store.update(manifest('m6', { startedAt: 6, state: 'complete' }))
    expect(getAll).toHaveBeenCalledTimes(1)
    getAll.mockRestore()
  })

  it('removes the records named', async () => {
    const store = openManifestStore()
    await store.put(manifest('a'))
    await store.put(manifest('b'))
    await store.remove(['a'])
    expect((await store.all()).map(({ id }) => id)).toEqual(['b'])
  })

  it('never rejects where storage is not offered', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const store = openManifestStore()
    await expect(store.put(manifest('a'))).resolves.toBeUndefined()
    await expect(store.all()).resolves.toEqual([])
    await expect(store.forget('device')).resolves.toBeUndefined()
    await expect(store.update(manifest('a'))).resolves.toBeUndefined()
    await expect(store.remove(['a'])).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})

describe('locks', () => {
  /** A LockManager that grants every request at once and holds it until its callback's promise settles. */
  function fakeLocks() {
    const held = new Set<string>()
    return {
      request: vi.fn(async (name: string, _options: unknown, callback: () => Promise<void>) => {
        held.add(name)
        try {
          await callback()
        } finally {
          held.delete(name)
        }
      }),
      query: vi.fn(async () => ({ held: [...held].map((name) => ({ name })) })),
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('holds the lock of an import until it is released, and tells the names held', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() })
    const release = holdLock('a')
    await vi.waitFor(async () => expect(await heldLockNames()).toEqual(new Set([lockName('a')])))

    release()

    await vi.waitFor(async () => expect(await heldLockNames()).toEqual(new Set()))
  })

  it('takes no lock if it is released before the browser grants it', async () => {
    const locks = fakeLocks()
    vi.stubGlobal('navigator', { locks })
    holdLock('a')()
    await vi.waitFor(async () => expect(await heldLockNames()).toEqual(new Set()))
  })

  it('reports no names where the browser has no locks', async () => {
    vi.stubGlobal('navigator', {})
    expect(await heldLockNames()).toBeNull()
    expect(() => holdLock('a')()).not.toThrow()
  })
})

describe('a manifest store whose database never opens', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists nothing and keeps nothing after the timeout, so an import is not stalled behind it', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const store = openManifestStore()
    const all = store.all()
    const put = store.put(manifest('m1'))

    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS)

    await expect(all).resolves.toEqual([])
    await expect(put).resolves.toBeUndefined()
  })
})

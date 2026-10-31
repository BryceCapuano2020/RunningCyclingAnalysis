// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lockName } from '../importManifest'
import type { ImportManifest, ManifestScope } from '../importManifest'
import type { ManifestStore } from '../importManifestStore'
import { useImportManifest } from './importManifestHook'

/** A store in memory, with the manifests it starts with. */
function memoryStore(
  start: ImportManifest[] = [],
): ManifestStore & { rows: Map<string, ImportManifest> } {
  const rows = new Map(start.map((manifest) => [manifest.id, manifest]))
  return {
    rows,
    all: async () => [...rows.values()],
    put: async (manifest) => void rows.set(manifest.id, manifest),
    update: async (manifest) => void (rows.has(manifest.id) && rows.set(manifest.id, manifest)),
    remove: async (ids) => void ids.forEach((id) => rows.delete(id)),
    forget: async (scope) => {
      for (const [id, manifest] of rows) if (manifest.scope === scope) rows.delete(id)
    },
  }
}

const FILES = [new File(['x'], 'export.zip')]

function setup(scope: ManifestScope | null = 'device', store = memoryStore()) {
  const hook = renderHook(() => useImportManifest(scope, store))
  return { ...hook, store }
}

function stored(over: Partial<ImportManifest>): ImportManifest {
  return {
    id: 'old',
    scope: 'device',
    startedAt: 1,
    updatedAt: 1,
    sources: [{ name: 'export.zip', size: 1 }],
    expected: 50,
    read: 20,
    damaged: [],
    state: 'running',
    ...over,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recording an import', () => {
  it('is running from the moment it is sent, and complete when it ends clean', async () => {
    const { result, store } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    expect([...store.rows.values()][0]).toMatchObject({
      state: 'running',
      sources: [{ name: 'export.zip', size: 1 }],
    })

    act(() => result.current.progress(1, 5, 12))
    act(() => result.current.finish(1, []))

    expect([...store.rows.values()][0]).toMatchObject({ state: 'complete', read: 5, expected: 12 })
    expect(result.current.incomplete).toBeNull()
  })

  it('says the library is short when a zip in the import was damaged', () => {
    const { result } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    act(() => result.current.finish(1, [{ name: 'export.zip', lost: 40 }]))

    expect(result.current.incomplete).toMatchObject({
      state: 'partial-source',
      damaged: [{ name: 'export.zip', lost: 40 }],
    })
  })

  it('says it stopped when the import was cut off, and keeps how far it got', () => {
    const { result } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    act(() => result.current.progress(1, 30, 100))
    act(() => result.current.fail())

    expect(result.current.incomplete).toMatchObject({
      state: 'interrupted',
      read: 30,
      expected: 100,
    })
  })

  it('writes progress at most every two seconds, and always the last file', () => {
    vi.useFakeTimers()
    try {
      const { result, store } = setup()
      act(() => result.current.begin(1, FILES, 'device'))
      act(() => result.current.progress(1, 1, 100))
      act(() => result.current.progress(1, 2, 100))
      expect([...store.rows.values()][0]?.read).toBe(1)
      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      act(() => result.current.progress(1, 3, 100))
      expect([...store.rows.values()][0]?.read).toBe(3)
      act(() => result.current.progress(1, 100, 100))
      expect([...store.rows.values()][0]?.read).toBe(100)
    } finally {
      vi.useRealTimers()
    }
  })

  it('finds the import an event is about by its request, not by its place in the queue', () => {
    const { result, store } = setup()
    act(() => result.current.begin(1, [new File(['a'], 'a.zip')], 'device'))
    act(() => result.current.begin(2, [new File(['b'], 'b.zip')], 'device'))
    act(() => result.current.progress(2, 7, 9))
    act(() => result.current.finish(2, []))

    const byName = (name: string) =>
      [...store.rows.values()].find((manifest) => manifest.sources[0]?.name === name)
    expect(byName('b.zip')).toMatchObject({ state: 'complete', read: 7 })
    expect(byName('a.zip')).toMatchObject({ state: 'running', read: 0 })
  })

  it('ends only the import that failed, and ignores a request it never recorded', () => {
    const { result, store } = setup()
    act(() => result.current.begin(1, [new File(['a'], 'a.zip')], 'device'))
    act(() => result.current.begin(2, [new File(['b'], 'b.zip')], 'device'))
    act(() => result.current.fail(9))
    act(() => result.current.finish(9, []))
    act(() => result.current.fail(2))

    const states = [...store.rows.values()].map(({ sources, state }) => [sources[0]?.name, state])
    expect(states).toEqual([
      ['a.zip', 'running'],
      ['b.zip', 'interrupted'],
    ])
  })

  it('records an import against the library it went into, not the one on screen', () => {
    const { result, store } = setup('device')
    act(() => result.current.begin(1, FILES, 'account:u1'))
    expect([...store.rows.values()][0]?.scope).toBe('account:u1')
    act(() => result.current.fail())
    expect(result.current.incomplete).toBeNull()
  })
})

describe('what an earlier visit left', () => {
  it('reports an import whose lock is gone as cut off', async () => {
    const { result } = setup('device', memoryStore([stored({})]))
    await waitFor(() =>
      expect(result.current.incomplete).toMatchObject({ id: 'old', state: 'interrupted' }),
    )
  })

  it('writes the correction back, so the next visit starts from it', async () => {
    const store = memoryStore([stored({})])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete).not.toBeNull())
    expect(store.rows.get('old')?.state).toBe('interrupted')
  })

  it('leaves an import running while another tab still holds its lock', async () => {
    vi.stubGlobal('navigator', {
      locks: { query: async () => ({ held: [{ name: lockName('old') }] }) },
    })
    const { result } = setup('device', memoryStore([stored({})]))
    await act(async () => undefined)
    expect(result.current.incomplete).toBeNull()
  })

  it('does not report another library’s import', async () => {
    const { result } = setup('account:u1', memoryStore([stored({ state: 'interrupted' })]))
    await act(async () => undefined)
    expect(result.current.incomplete).toBeNull()
  })
})

describe('after the notice', () => {
  it('goes on with what the library holds: the notice goes for good', async () => {
    const store = memoryStore([stored({ state: 'interrupted' })])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete).not.toBeNull())

    act(() => result.current.accept())

    expect(result.current.incomplete).toBeNull()
    expect(store.rows.get('old')?.state).toBe('accepted-partial')
  })

  it('goes when the same files are added again and finish', async () => {
    const store = memoryStore([
      stored({ state: 'interrupted', sources: [{ name: 'export.zip', size: 1 }] }),
    ])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete).not.toBeNull())

    act(() => result.current.begin(1, FILES, 'device'))
    act(() => result.current.finish(1, []))

    expect(result.current.incomplete).toBeNull()
    // Nothing is short any more, so the old record's file names are not kept.
    expect(store.rows.has('old')).toBe(false)
  })

  it('goes with the library when everything is removed', async () => {
    const store = memoryStore([stored({ state: 'interrupted' })])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete).not.toBeNull())

    act(() => result.current.forget('device'))

    expect(result.current.incomplete).toBeNull()
    expect(store.rows.size).toBe(0)
  })
})

describe('closing the tab', () => {
  const asked = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('asks first while an import that has read something is going on, and stops asking when it ends', () => {
    const { result } = setup()
    expect(asked()).toBe(false)
    act(() => result.current.begin(1, FILES, 'device'))
    expect(asked()).toBe(false)
    act(() => result.current.progress(1, 1, 10))
    expect(asked()).toBe(true)

    act(() => result.current.finish(1, []))
    expect(asked()).toBe(false)
  })

  it('stops asking when the import is cut off', () => {
    const { result } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    act(() => result.current.progress(1, 1, 10))
    act(() => result.current.fail())
    expect(asked()).toBe(false)
  })
})

describe('an earlier cut-off import and a later one', () => {
  it('is still told about when a later, smaller import finished', async () => {
    const store = memoryStore([
      stored({ id: 'cut', state: 'interrupted', startedAt: 1, expected: 5_000, read: 100 }),
    ])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete?.id).toBe('cut'))

    act(() => result.current.begin(1, [new File(['y'], 'one-ride.gpx')], 'device'))
    act(() => result.current.progress(1, 1, 1))
    act(() => result.current.finish(1, []))

    expect(result.current.incomplete?.id).toBe('cut')
  })

  it('goes when a later import read at least as many files as the cut-off one was meant to', async () => {
    const store = memoryStore([
      stored({ id: 'cut', state: 'interrupted', startedAt: 1, expected: 50, read: 20 }),
    ])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete?.id).toBe('cut'))

    act(() => result.current.begin(1, [new File(['y'], 'redownloaded.zip')], 'device'))
    act(() => result.current.progress(1, 52, 52))
    act(() => result.current.finish(1, []))

    expect(result.current.incomplete).toBeNull()
  })

  it('is all set aside by one "Use what I have"', async () => {
    const store = memoryStore([
      stored({ id: 'a', state: 'interrupted', startedAt: 1 }),
      stored({ id: 'b', state: 'partial-source', startedAt: 2 }),
    ])
    const { result } = setup('device', store)
    await waitFor(() => expect(result.current.incomplete?.id).toBe('b'))

    act(() => result.current.accept())

    expect(result.current.incomplete).toBeNull()
    expect([...store.rows.values()].map(({ state }) => state)).toEqual([
      'accepted-partial',
      'accepted-partial',
    ])
  })
})

describe('the record while an import runs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is written every ten seconds even when no file is read, so a long last phase is not taken for a dead import', () => {
    vi.useFakeTimers()
    const { result, store } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    const first = [...store.rows.values()][0]!.updatedAt
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect([...store.rows.values()][0]!.updatedAt).toBeGreaterThanOrEqual(first + 10_000)

    act(() => result.current.finish(1, []))
    const ended = [...store.rows.values()][0]!.updatedAt
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect([...store.rows.values()][0]!.updatedAt).toBe(ended)
  })

  it('names the tab that ran it', () => {
    const { result, store } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    expect([...store.rows.values()][0]?.tabId).toEqual(expect.any(String))
  })

  it('does not bring back a record another tab removed', () => {
    const { result, store } = setup()
    act(() => result.current.begin(1, FILES, 'device'))
    store.rows.clear()
    act(() => result.current.progress(1, 3, 10))
    act(() => result.current.finish(1, []))
    expect(store.rows.size).toBe(0)
  })

  it('keeps the lock until the record says how the import ended', async () => {
    const events: string[] = []
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: unknown, callback: () => Promise<void>) => {
          await callback()
          events.push('released')
        },
        query: async () => ({ held: [] }),
      },
    })
    const store = memoryStore()
    const update = store.update
    store.update = async (manifest) => {
      if (manifest.state === 'complete') events.push('written')
      await update(manifest)
    }
    const { result } = setup('device', store)
    act(() => result.current.begin(1, FILES, 'device'))
    act(() => result.current.finish(1, []))
    await waitFor(() => expect(events).toEqual(['written', 'released']))
  })

  it('drops an account’s records from memory when that account is no longer shown', async () => {
    const store = memoryStore([stored({ id: 'mine', scope: 'account:u1', state: 'interrupted' })])
    let scope: ManifestScope | null = 'account:u1'
    const hook = renderHook(() => useImportManifest(scope, store))
    await waitFor(() => expect(hook.result.current.incomplete?.id).toBe('mine'))

    scope = 'device'
    hook.rerender()
    store.rows.clear()
    scope = 'account:u1'
    hook.rerender()
    await act(async () => undefined)

    // Back in memory only from storage, which no longer holds it.
    expect(hook.result.current.incomplete).toBeNull()
  })
})

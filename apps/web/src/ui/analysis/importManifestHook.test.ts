// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lockName } from '../importManifest'
import type { ImportManifest, ManifestScope, ManifestStore } from '../importManifest'
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
    act(() => result.current.begin(FILES, 'device'))
    expect([...store.rows.values()][0]).toMatchObject({
      state: 'running',
      sources: [{ name: 'export.zip', size: 1 }],
    })

    act(() => result.current.progress(5, 12))
    act(() => result.current.finish([]))

    expect([...store.rows.values()][0]).toMatchObject({ state: 'complete', read: 5, expected: 12 })
    expect(result.current.incomplete).toBeNull()
  })

  it('says the library is short when a zip in the import was damaged', () => {
    const { result } = setup()
    act(() => result.current.begin(FILES, 'device'))
    act(() => result.current.finish([{ name: 'export.zip', lost: 40 }]))

    expect(result.current.incomplete).toMatchObject({
      state: 'partial-source',
      damaged: [{ name: 'export.zip', lost: 40 }],
    })
  })

  it('says it stopped when the import was cut off, and keeps how far it got', () => {
    const { result } = setup()
    act(() => result.current.begin(FILES, 'device'))
    act(() => result.current.progress(30, 100))
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
      act(() => result.current.begin(FILES, 'device'))
      act(() => result.current.progress(1, 100))
      act(() => result.current.progress(2, 100))
      expect([...store.rows.values()][0]?.read).toBe(1)
      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      act(() => result.current.progress(3, 100))
      expect([...store.rows.values()][0]?.read).toBe(3)
      act(() => result.current.progress(100, 100))
      expect([...store.rows.values()][0]?.read).toBe(100)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes the oldest running import as the one the events are about', () => {
    const { result, store } = setup()
    act(() => result.current.begin([new File(['a'], 'a.zip')], 'device'))
    act(() => result.current.begin([new File(['b'], 'b.zip')], 'device'))
    act(() => result.current.progress(7, 9))
    act(() => result.current.finish([]))

    const byName = (name: string) =>
      [...store.rows.values()].find((manifest) => manifest.sources[0]?.name === name)
    expect(byName('a.zip')).toMatchObject({ state: 'complete', read: 7 })
    expect(byName('b.zip')?.state).toBe('running')
  })

  it('records an import against the library it went into, not the one on screen', () => {
    const { result, store } = setup('device')
    act(() => result.current.begin(FILES, 'account:u1'))
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

    act(() => result.current.begin(FILES, 'device'))
    act(() => result.current.finish([]))

    expect(result.current.incomplete).toBeNull()
    expect(store.rows.get('old')?.state).toBe('superseded')
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
    act(() => result.current.begin(FILES, 'device'))
    expect(asked()).toBe(false)
    act(() => result.current.progress(1, 10))
    expect(asked()).toBe(true)

    act(() => result.current.finish([]))
    expect(asked()).toBe(false)
  })

  it('stops asking when the import is cut off', () => {
    const { result } = setup()
    act(() => result.current.begin(FILES, 'device'))
    act(() => result.current.progress(1, 10))
    act(() => result.current.fail())
    expect(asked()).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCOPE = { kind: 'device' } as const

/** A fake `indexedDB` whose open request is handed to the test, to fire events on or leave pending. */
function stubIndexedDb() {
  const request = {} as {
    onblocked?: () => void
    onerror?: () => void
    onsuccess?: () => void
    onupgradeneeded?: () => void
    result?: { close: () => void }
    error?: Error
  }
  vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })
  return request
}

async function load() {
  vi.resetModules()
  return {
    ...(await import('./workbenchOpen')),
    ...(await import('./workbenchStore')),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('opening the workbench database', () => {
  it('fails at once, with nothing cached, where there is no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { openDatabase } = await load()

    await expect(openDatabase('db', 1, () => undefined)).rejects.toMatchObject({
      nothingCached: true,
    })
  })

  it('gives up when another tab blocks the upgrade, so an import is not held up', async () => {
    const request = stubIndexedDb()
    const { openDatabase } = await load()
    const opening = openDatabase('db', 1, () => undefined)
    request.onblocked?.()

    await expect(opening).rejects.toMatchObject({ nothingCached: false })
  })

  it('gives up when the open never answers, and closes a connection that arrives late', async () => {
    const request = stubIndexedDb()
    const { openDatabase } = await load()
    const opening = openDatabase('db', 1, () => undefined, 1_000)
    const assertion = expect(opening).rejects.toMatchObject({ nothingCached: false })

    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    const close = vi.fn()
    request.result = { close }
    request.onsuccess?.()

    expect(close).toHaveBeenCalled()
  })
})

describe('the workbench store when it cannot be opened', () => {
  it('holds nothing where there is no IndexedDB, so removing from it succeeds', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { openWorkbenchStore } = await load()
    const store = openWorkbenchStore()

    expect(await store.remove(SCOPE, 'a')).toBe(true)
    expect(await store.clearScope(SCOPE)).toBe(true)
    expect(await store.get(SCOPE, 'a')).toBeNull()
    // Storage that is not there cannot say whether a trace is in it.
    expect(await store.has(SCOPE, 'a')).toBeNull()
  })

  it('cannot say what a blocked database holds, so a removal from it is refused', async () => {
    const request = stubIndexedDb()
    const { openWorkbenchStore } = await load()
    const store = openWorkbenchStore()
    const removing = store.remove(SCOPE, 'a')
    request.onblocked?.()

    expect(await removing).toBe(false)
    // The next removal opens afresh, and is refused just the same.
    const clearing = store.clearScope(SCOPE)
    request.onblocked?.()
    expect(await clearing).toBe(false)
  })

  it('cannot say what a database that errors on open holds, however long ago it did', async () => {
    const request = stubIndexedDb()
    const { openWorkbenchStore } = await load()
    const store = openWorkbenchStore()
    const removing = store.remove(SCOPE, 'a')
    request.onerror?.()

    expect(await removing).toBe(false)
  })

  it('opens afresh to remove, so a backoff is never taken for a removal', async () => {
    const request = stubIndexedDb()
    const { openWorkbenchStore } = await load()
    const store = openWorkbenchStore()
    const reading = store.has(SCOPE, 'a')
    request.onblocked?.()
    expect(await reading).toBeNull()
    const indexedDb = (globalThis as unknown as { indexedDB: { open: ReturnType<typeof vi.fn> } })
      .indexedDB
    expect(indexedDb.open).toHaveBeenCalledTimes(1)

    // Reads and writes fail at once while backing off; a removal opens again.
    expect(await store.has(SCOPE, 'a')).toBeNull()
    expect(indexedDb.open).toHaveBeenCalledTimes(1)
    const removing = store.remove(SCOPE, 'a')
    request.onblocked?.()
    expect(await removing).toBe(false)
    expect(indexedDb.open).toHaveBeenCalledTimes(2)
  })

  it('tries to open again once the backoff has passed', async () => {
    const request = stubIndexedDb()
    const { openWorkbenchStore } = await load()
    const store = openWorkbenchStore()
    const reading = store.has(SCOPE, 'a')
    request.onblocked?.()
    await reading
    const indexedDb = (globalThis as unknown as { indexedDB: { open: ReturnType<typeof vi.fn> } })
      .indexedDB

    await vi.advanceTimersByTimeAsync(29_000)
    await store.has(SCOPE, 'a')
    expect(indexedDb.open).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_000)
    const again = store.has(SCOPE, 'a')
    request.onblocked?.()
    await again
    expect(indexedDb.open).toHaveBeenCalledTimes(2)
  })

  it('rejects the account deleted check rather than guessing', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { openWorkbenchStore } = await load()

    await expect(
      openWorkbenchStore().isDeleted({ kind: 'account', userId: 'alice' }),
    ).rejects.toBeInstanceOf(Error)
  })
})

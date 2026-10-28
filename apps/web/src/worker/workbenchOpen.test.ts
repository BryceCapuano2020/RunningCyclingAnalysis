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
    expect(await store.has(SCOPE, 'a')).toBe(false)
  })

  it('cannot say what a blocked database holds, so a removal from it is refused', async () => {
    const request = stubIndexedDb()
    const { openWorkbenchStore } = await load()
    const store = openWorkbenchStore()
    const removing = store.remove(SCOPE, 'a')
    request.onblocked?.()

    expect(await removing).toBe(false)
    // The next call does not wait on the open again.
    expect(await store.clearScope(SCOPE)).toBe(false)
  })

  it('rejects the account deleted check rather than guessing', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { openWorkbenchStore } = await load()

    await expect(
      openWorkbenchStore().isDeleted({ kind: 'account', userId: 'alice' }),
    ).rejects.toBeInstanceOf(Error)
  })
})

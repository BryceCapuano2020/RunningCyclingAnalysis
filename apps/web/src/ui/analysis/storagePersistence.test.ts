import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistence } from './storagePersistence'

function stubStorage(storage: unknown) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage')
})

describe('requestPersistence', () => {
  it('is unknown in a browser with no storage manager, so nothing is reported', async () => {
    stubStorage(undefined)
    await expect(requestPersistence()).resolves.toBe('unknown')
  })

  it('is unknown in a browser that cannot be asked', async () => {
    stubStorage({})
    await expect(requestPersistence()).resolves.toBe('unknown')
  })

  it('does not ask a browser that already keeps the storage', async () => {
    const persist = vi.fn(async () => false)
    stubStorage({ persisted: async () => true, persist })
    await expect(requestPersistence()).resolves.toBe('kept')
    expect(persist).not.toHaveBeenCalled()
  })

  it('reports the answer of a browser that is asked', async () => {
    stubStorage({ persisted: async () => false, persist: async () => true })
    await expect(requestPersistence()).resolves.toBe('kept')
    stubStorage({ persisted: async () => false, persist: async () => false })
    await expect(requestPersistence()).resolves.toBe('not-promised')
  })

  it('asks a browser that cannot say what it keeps', async () => {
    stubStorage({ persist: async () => false })
    await expect(requestPersistence()).resolves.toBe('not-promised')
  })

  it('is unknown when the browser throws', async () => {
    stubStorage({
      persisted: async () => {
        throw new Error('blocked')
      },
      persist: async () => true,
    })
    await expect(requestPersistence()).resolves.toBe('unknown')
  })
})

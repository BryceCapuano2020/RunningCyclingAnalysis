import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { sampleDataset } from '@rca/core/synthetic'
import { activityTraceOf } from '@rca/core/workbench'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const activity = sampleDataset().activities[0]!
const trace = activityTraceOf(activity)

/** The modules over a fresh, empty fake IndexedDB, as a new browser profile would have. */
async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const { openWorkbenchStore } = await import('./workbenchStore')
  const { sweepAccountDetails } = await import('./sweepAccountDetails')
  const store = openWorkbenchStore()
  for (const scope of [
    { kind: 'account', userId: 'alice' },
    { kind: 'account', userId: 'bob' },
    { kind: 'device' },
  ] as const) {
    await store.put(scope, trace, activity.startMs)
  }
  return { store, sweepAccountDetails }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('sweeping the accounts that are no longer this browser’s', () => {
  it('clears every account but the signed-in one, and leaves the device library', async () => {
    const { store, sweepAccountDetails } = await fresh()

    await sweepAccountDetails('bob')

    expect(await store.has({ kind: 'account', userId: 'alice' }, trace.activityId)).toBe(false)
    expect(await store.has({ kind: 'account', userId: 'bob' }, trace.activityId)).toBe(true)
    expect(await store.has({ kind: 'device' }, trace.activityId)).toBe(true)
  })

  it('clears every account when nobody is signed in, but not the signed-out library', async () => {
    const { store, sweepAccountDetails } = await fresh()

    await sweepAccountDetails(null)

    expect(await store.has({ kind: 'account', userId: 'alice' }, trace.activityId)).toBe(false)
    expect(await store.has({ kind: 'account', userId: 'bob' }, trace.activityId)).toBe(false)
    expect(await store.has({ kind: 'device' }, trace.activityId)).toBe(true)
  })

  it('does nothing without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()
    const { sweepAccountDetails } = await import('./sweepAccountDetails')
    await expect(sweepAccountDetails(null)).resolves.toBeUndefined()
  })

  it('does nothing where the browser refuses site storage, so naming IndexedDB throws', async () => {
    // A browser that blocks site data can throw from the property itself; the sweep is called as `void`, so a
    // rejection would reach the console as an unhandled one.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      vi.resetModules()
      const { sweepAccountDetails } = await import('./sweepAccountDetails')
      await expect(sweepAccountDetails('alice')).resolves.toBeUndefined()
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'indexedDB')
      else Object.defineProperty(globalThis, 'indexedDB', original)
    }
  })
})

describe('sweeping a browser that never stored a recording', () => {
  /** A factory that lists databases only through `list`, as a browser without `databases()` does not. */
  function withoutListing() {
    const factory = new IDBFactory()
    const listing = factory.databases.bind(factory)
    const list = () => listing().then((all) => all.map((database) => database.name))
    Object.defineProperty(factory, 'databases', { value: undefined })
    vi.stubGlobal('indexedDB', factory)
    return { list }
  }

  it('does not create the recordings database', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    vi.resetModules()
    const { sweepAccountDetails } = await import('./sweepAccountDetails')

    await sweepAccountDetails(null)

    expect(await factory.databases()).toEqual([])
  })

  it('does not create it where the browser cannot list databases', async () => {
    const { list } = withoutListing()
    vi.resetModules()
    const { sweepAccountDetails } = await import('./sweepAccountDetails')
    const { workbenchExists } = await import('./workbenchExists')

    expect(await workbenchExists()).toBe(false)
    await sweepAccountDetails(null)

    expect(await list()).toEqual([])
  })

  it('finds a database that was made, by either route', async () => {
    await fresh()
    const { workbenchExists } = await import('./workbenchExists')
    expect(await workbenchExists()).toBe(true)

    vi.stubGlobal(
      'indexedDB',
      Object.create(indexedDB, { databases: { value: undefined } }) as IDBFactory,
    )
    expect(await workbenchExists()).toBe(true)
  })
})

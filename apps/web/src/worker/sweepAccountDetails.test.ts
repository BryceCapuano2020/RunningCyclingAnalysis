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

describe('sweeping the saves other accounts left waiting', () => {
  async function withRows() {
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.resetModules()
    const { openOutbox } = await import('./outbox')
    const { digestActivity } = await import('@rca/core/digest')
    const { sweepAccountDetails } = await import('./sweepAccountDetails')
    const digest = digestActivity(activity)
    const item = { digest, fileName: 'run.fit', fileHash: 'a'.repeat(64) }
    await openOutbox('alice').add(item)
    await openOutbox('bob').add(item)
    return { openOutbox, sweepAccountDetails }
  }

  it('removes the rows of a session that expired once somebody else signs in', async () => {
    const { openOutbox, sweepAccountDetails } = await withRows()

    // Alice's session ended on its own; her rows wait. Bob signs in on the same browser.
    await sweepAccountDetails('bob')

    expect(await openOutbox('alice').pending()).toEqual([])
    expect((await openOutbox('bob').pending()).length).toBe(1)
  })

  it('keeps them while nobody is signed in: the account’s next sign-in finishes them', async () => {
    const { openOutbox, sweepAccountDetails } = await withRows()

    await sweepAccountDetails(null)

    expect((await openOutbox('alice').pending()).length).toBe(1)
    expect((await openOutbox('bob').pending()).length).toBe(1)
  })

  it('keeps the signed-in account’s own rows', async () => {
    const { openOutbox, sweepAccountDetails } = await withRows()

    await sweepAccountDetails('alice')

    expect((await openOutbox('alice').pending()).length).toBe(1)
    expect(await openOutbox('bob').pending()).toEqual([])
  })
})

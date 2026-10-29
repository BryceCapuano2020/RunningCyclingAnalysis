import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { sampleDataset } from '@rca/core/synthetic'
import { activityTraceOf } from '@rca/core/workbench'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraceScope } from './workbenchStore'

const activity = sampleDataset().activities[0]!
const trace = activityTraceOf(activity)
const DEVICE: TraceScope = { kind: 'device' }
const ALICE: TraceScope = { kind: 'account', userId: 'alice' }

/** Modules over a fresh, empty fake IndexedDB, as a new browser profile would have. */
async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const [store, ledger, schema] = await Promise.all([
    import('./workbenchStore'),
    import('./workbenchLedger'),
    import('./workbenchSchema'),
  ])
  return { store: store.openWorkbenchStore(), ...ledger, ...schema }
}

/** The test environment is Node, which the app's types leave out. */
const node = (
  globalThis as unknown as {
    process: {
      on: (event: 'unhandledRejection', listener: (reason: unknown) => void) => void
      off: (event: 'unhandledRejection', listener: (reason: unknown) => void) => void
    }
  }
).process

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)

beforeEach(() => {
  unhandled.length = 0
  node.on('unhandledRejection', onUnhandled)
})

afterEach(async () => {
  // Let a rejection nobody handled surface before the listener goes.
  await new Promise((resolve) => setTimeout(resolve, 20))
  node.off('unhandledRejection', onUnhandled)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  expect(unhandled).toEqual([])
})

describe('a throw part way through a workbench transaction', () => {
  it('rolls back the deletes a failed clear queued, with no unhandled rejection', async () => {
    const { store } = await fresh()
    await store.put(ALICE, trace, activity.startMs)
    const real = IDBObjectStore.prototype.put
    // Only the owners row of the sign-out mark fails, after the clear queued its deletes.
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'owners') throw new Error('put failed')
      return real.call(this, value, key)
    })

    expect(await store.clearScope(ALICE)).toBe(false)

    vi.restoreAllMocks()
    expect(await store.has(ALICE, trace.activityId)).toBe(true)
    expect(await store.get(ALICE, trace.activityId)).toEqual(trace)
  })

  it('rolls back a failed removal', async () => {
    const { store } = await fresh()
    await store.put(DEVICE, trace, activity.startMs)
    const real = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'state') throw new Error('put failed')
      return real.call(this, value, key)
    })

    expect(await store.remove(DEVICE, trace.activityId)).toBe(false)

    vi.restoreAllMocks()
    expect(await store.has(DEVICE, trace.activityId)).toBe(true)
  })

  it('does not hang a clear when a cursor step throws', async () => {
    const { store } = await fresh()
    await store.put(DEVICE, trace, activity.startMs)
    vi.spyOn(IDBCursor.prototype, 'delete').mockImplementation(() => {
      throw new Error('delete failed')
    })

    expect(await store.clearScope(DEVICE)).toBe(false)

    vi.restoreAllMocks()
    expect(await store.has(DEVICE, trace.activityId)).toBe(true)
  })

  it('does not hang a ledger repair when a cursor step throws', async () => {
    const { repairLedger, workbenchDatabase, ENTRIES } = await fresh()
    const db = await workbenchDatabase()
    // A metadata row that does not read, which the rebuild deletes through a cursor.
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ENTRIES, 'readwrite')
      transaction.objectStore(ENTRIES).put({ key: 'bad', scopeKey: 'device' })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    vi.spyOn(IDBCursor.prototype, 'delete').mockImplementation(() => {
      throw new Error('delete failed')
    })

    expect(await repairLedger()).toBe(false)
  })
})

describe('checking a trace', () => {
  it('trusts the app’s own trace when it is written, and checks what it reads back', async () => {
    const { store } = await fresh()
    // A value no trace the app builds could hold: an infinite speed.
    const speed = Float32Array.from({ length: trace.durationS }, () => 1)
    speed[3] = Infinity
    const odd = { ...trace, streams: { ...trace.streams, speed } }

    expect(await store.put(DEVICE, odd, activity.startMs)).toBe('stored')

    // Read back, it is checked, found wrong, and dropped from the cache.
    expect(await store.get(DEVICE, odd.activityId)).toBeNull()
    expect(await store.has(DEVICE, odd.activityId)).toBe(false)
  })
})

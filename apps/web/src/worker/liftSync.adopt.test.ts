import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { liftSetKey } from '@rca/core/lift'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openLiftStore } from './liftStore'
import { createLiftSync } from './liftSync'
import { fakeTransport, make } from './liftTestKit'
import { LiftTransportError } from './liftTransport'

const key = (order: number) => liftSetKey(make(order))

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

describe('adoption', () => {
  it('sends device sets insertOnly, counts the keys the account kept and removes the device rows', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    await device.save(make(2))
    const { transport, calls } = fakeTransport({
      put: () => ({ liftRevision: 3, skipped: [key(2)] }),
    })
    const result = await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(calls).toEqual([{ type: 'put', orders: [1, 2], insertOnly: true }])
    expect(result).toMatchObject({ sent: 2, skipped: 1, done: true })
    expect(await device.list()).toEqual([])
  })

  it('keeps the device rows when a request fails', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    const { transport } = fakeTransport({ put: () => new LiftTransportError('other') })
    const result = await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(result).toMatchObject({ sent: 0, done: false })
    expect(await device.list()).toHaveLength(1)
  })

  it('handles a 400 as a flush does: the named set goes, the rest is sent again', async () => {
    const device = openLiftStore('device')
    for (const order of [1, 2, 3]) await device.save(make(order))
    const { transport, calls } = fakeTransport({
      put: (_sets, call) =>
        call === 1 ? new LiftTransportError('invalid', [1]) : { liftRevision: 4 },
    })
    const result = await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(calls.map((call) => call.type === 'put' && call.orders)).toEqual([
      [1, 2, 3],
      [1, 3],
    ])
    expect(result).toMatchObject({ sent: 2, refused: 1, done: true })
    expect(await device.list()).toEqual([])
  })

  it('holds the rows of a failure that will not repeat (413) and is not done', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    const { transport } = fakeTransport({ put: () => new LiftTransportError('other', [], false) })
    const result = await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(result).toMatchObject({ sent: 0, held: 1, done: false })
    expect((await device.list())[0]).toMatchObject({ state: 'put', attempts: 1 })
  })

  it('reports a 409 apart, keeps those rows and finishes the later chunks', async () => {
    const device = openLiftStore('device')
    for (let order = 1; order <= 501; order++) await device.save(make(order))
    const { transport, calls } = fakeTransport({
      put: (_sets, call) => (call === 1 ? new LiftTransportError('cap') : { liftRevision: 4 }),
    })
    const result = await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({ sent: 1, capped: 500, done: true })
    expect(await device.list()).toHaveLength(500)
  }, 20_000)

  it('settles device delete rows left by an earlier version instead of sending them', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    // A delete row as an earlier version wrote it.
    const db = indexedDB.open('rca-lifts')
    await new Promise<void>((resolve) => {
      db.onsuccess = () => {
        const tx = db.result.transaction('rows', 'readwrite')
        tx.objectStore('rows').put({
          id: `device|${key(9)}`,
          scope: 'device',
          key: key(9),
          set: make(9),
          state: 'delete',
          rev: 2,
          attempts: 0,
        })
        tx.oncomplete = () => {
          db.result.close()
          resolve()
        }
      }
    })
    const { transport, calls } = fakeTransport({})
    await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(calls).toEqual([{ type: 'put', orders: [1], insertOnly: true }])
    expect(await device.list()).toEqual([])
  })
})

describe('which revision the store is at', () => {
  const syncAt = async (pulledRevision: number, liftRevision: number) => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    const fake = fakeTransport({
      put: () => ({ liftRevision }),
      pages: () => ({ items: [], next: null, liftRevision }),
    })
    const sync = createLiftSync({ store, transport: fake.transport, pulledRevision })
    return { sync, calls: fake.calls }
  }

  it('an ack one past the last known revision is only our write: no pull', async () => {
    const { sync, calls } = await syncAt(5, 6)
    expect((await sync.sync()).pull).toBeNull()
    expect(calls.some((call) => call.type === 'page')).toBe(false)
  })

  it('an ack further on means another device wrote too: pull', async () => {
    const { sync } = await syncAt(5, 8)
    expect((await sync.sync()).pull).toMatchObject({ complete: true, liftRevision: 8 })
  })

  it('an incomplete pull runs again at the next sync without the caller passing a revision', async () => {
    const store = openLiftStore('u1')
    let round = 0
    const { transport, calls } = fakeTransport({
      pages: (cursor) => {
        // The account moves from 5 to 6 while the first pull reads; the second pull sees 6 throughout.
        if (cursor === null) return { items: [], next: 'p2', liftRevision: round === 0 ? 5 : 6 }
        round++
        return { items: [], next: null, liftRevision: 6 }
      },
    })
    const sync = createLiftSync({ store, transport })
    expect((await sync.sync()).pull).toMatchObject({ complete: false })
    expect((await sync.sync()).pull).toMatchObject({ complete: true, liftRevision: 6 })
    expect(calls.filter((call) => call.type === 'page')).toHaveLength(4)
  })
})

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { liftSetKey } from '@rca/core/lift'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openLiftStore } from './liftStore'
import { createLiftSync, retryDelayMs } from './liftSync'
import type { LockProvider } from './liftSync'
import { fakeTransport, make } from './liftTestKit'
import { LiftTransportError } from './liftTransport'

const key = (order: number) => liftSetKey(make(order))
const stateOf = async (store: ReturnType<typeof openLiftStore>) =>
  Object.fromEntries((await store.list()).map((row) => [row.set.setOrder, row.state]))

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

describe('the flush', () => {
  it('sends deletes, then replaces, then new keys, and acks each row', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1), make(2)], 4, true)
    await store.remove(key(2))
    await store.save(make(1, 65))
    await store.save(make(3))
    const { transport, calls } = fakeTransport({ put: () => ({ liftRevision: 5 }) })
    const result = await createLiftSync({ store, transport }).flush()
    expect(calls.map((call) => call.type)).toEqual(['remove', 'put', 'put'])
    expect(calls.slice(1).map((call) => call.type === 'put' && call.orders)).toEqual([[1], [3]])
    expect(result).toMatchObject({ sent: 3, held: 0, refused: 0, retryInMs: null, liftRevision: 5 })
    expect(await stateOf(store)).toEqual({ 1: 'synced', 3: 'synced' })
  })

  it('sends chunks of 500, and at the cap refuses only the new keys', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1)], 4, true)
    await store.save(make(1, 65))
    for (let order = 2; order <= 502; order++) await store.save(make(order))
    const { transport, calls } = fakeTransport({
      put: (sets) =>
        sets.length === 1 && sets[0]?.setOrder === 1
          ? { liftRevision: 5 }
          : new LiftTransportError('cap'),
    })
    const result = await createLiftSync({ store, transport }).flush()
    expect(calls.map((call) => call.type === 'put' && call.orders.length)).toEqual([1, 500])
    expect(result).toMatchObject({ sent: 1, held: 500 })
    const rows = await store.list()
    expect(rows.find((row) => row.set.setOrder === 1)?.state).toBe('synced')
    expect(rows.filter((row) => row.state === 'put' && row.attempts === 0)).toHaveLength(501)
  }, 20_000)

  it('a 400 naming a row reverts it, counts a new one as not saved, and resends the rest', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1)], 4, true)
    await store.save(make(1, 65))
    await store.save(make(2))
    await store.save(make(3))
    const { transport, calls } = fakeTransport({
      put: (_sets, call) =>
        call <= 2 ? new LiftTransportError('invalid', [0]) : { liftRevision: 6 },
    })
    const result = await createLiftSync({ store, transport }).flush()
    expect(result.refused).toBe(1)
    expect(await stateOf(store)).toEqual({ 1: 'synced', 3: 'synced' })
    expect((await store.list()).find((row) => row.set.setOrder === 1)?.set.loadKg).toBe(60)
    expect(calls.map((call) => call.type === 'put' && call.orders)).toEqual([[1], [2, 3], [3]])
  })

  it('a 400 naming no row holds every row of the request with attempts + 1', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    await store.save(make(2))
    const { transport } = fakeTransport({ put: () => new LiftTransportError('invalid') })
    const result = await createLiftSync({ store, transport }).flush()
    expect(result).toMatchObject({ sent: 0, held: 2, retryInMs: retryDelayMs(1) })
    expect((await store.list()).map((row) => [row.state, row.attempts])).toEqual([
      ['put', 1],
      ['put', 1],
    ])
  })

  it('another failure holds the row, counts the attempt and stops; a 401 stops with nothing counted', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    await store.remove(key(1))
    await store.save(make(2))
    const down = fakeTransport({ remove: () => new LiftTransportError('other') })
    const first = await createLiftSync({ store, transport: down.transport }).flush()
    expect(down.calls).toHaveLength(1)
    expect(first).toMatchObject({ held: 1, retryInMs: retryDelayMs(1) })
    expect((await store.list()).find((row) => row.state === 'delete')?.attempts).toBe(1)

    const signedOut = fakeTransport({ remove: () => new LiftTransportError('unauthorized') })
    const second = await createLiftSync({ store, transport: signedOut.transport }).flush()
    expect(second.unauthorized).toBe(true)
    expect(signedOut.calls).toHaveLength(1)
    expect((await store.list()).find((row) => row.state === 'delete')?.attempts).toBe(1)
  })

  it('a restart mid-send leaves the rows as they were and the next flush resends', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    const stuck = fakeTransport({ gate: () => new Promise<void>(() => undefined) })
    void createLiftSync({
      store,
      transport: stuck.transport,
      locks: { request: (_n, w) => w() },
    }).flush()
    await vi.waitFor(() => expect(stuck.calls).toHaveLength(1))
    // The tab goes: a new store handle and engine meet the same rows.
    const reopened = openLiftStore('u1')
    expect(await stateOf(reopened)).toEqual({ 1: 'put' })
    const live = fakeTransport({})
    await createLiftSync({ store: reopened, transport: live.transport }).flush()
    expect(live.calls).toHaveLength(1)
    expect(await stateOf(reopened)).toEqual({ 1: 'synced' })
  })

  it('a stale ack does not settle a row that changed while its send was out', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    const { transport } = fakeTransport({
      gate: () => store.save(make(1, 99)).then(() => undefined),
    })
    await createLiftSync({ store, transport }).flush()
    expect((await store.list())[0]).toMatchObject({ state: 'put', rev: 2 })
    expect((await store.list())[0]?.set.loadKg).toBe(99)
  })
})

describe('one flush per browser', () => {
  const sharedLock = (): LockProvider => {
    let tail: Promise<unknown> = Promise.resolve()
    return {
      request: (_name, work) => {
        const run = tail.then(work)
        tail = run.catch(() => undefined)
        return run
      },
    }
  }
  const twoEngines = async (locks?: LockProvider) => {
    const a = openLiftStore('u1')
    const b = openLiftStore('u1')
    await a.save(make(1))
    await a.save(make(2))
    const fake = fakeTransport({ gate: () => new Promise((resolve) => setTimeout(resolve, 5)) })
    const options = { transport: fake.transport, ...(locks === undefined ? {} : { locks }) }
    await Promise.all([
      createLiftSync({ store: a, ...options }).flush(),
      createLiftSync({ store: b, ...options }).flush(),
    ])
    return fake
  }

  it('two engines on one store never overlap under the lock', async () => {
    expect((await twoEngines(sharedLock())).overlapped()).toBe(false)
  })

  it('the in-memory fallback holds where navigator.locks is missing', async () => {
    expect((await twoEngines()).overlapped()).toBe(false)
  })

  it('without a lock the same two engines do overlap, so the check above can fail', async () => {
    expect((await twoEngines({ request: (_n, w) => w() })).overlapped()).toBe(true)
  })
})

describe('the pull', () => {
  it('is complete only when every page carries one revision, and removes nothing otherwise', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1)], 4, true)
    const moving = fakeTransport({
      pages: (cursor) =>
        cursor === null
          ? { items: [make(2)], next: 'p2', liftRevision: 5 }
          : { items: [make(3)], next: null, liftRevision: 6 },
    })
    const sync = createLiftSync({ store, transport: moving.transport })
    expect(await sync.pull()).toMatchObject({ complete: false, liftRevision: 6, failed: false })
    expect(await stateOf(store)).toEqual({ 1: 'synced', 2: 'synced', 3: 'synced' })

    const steady = fakeTransport({
      pages: (cursor) =>
        cursor === null
          ? { items: [make(2)], next: 'p2', liftRevision: 7 }
          : { items: [make(3)], next: null, liftRevision: 7 },
    })
    expect(await createLiftSync({ store, transport: steady.transport }).pull()).toMatchObject({
      complete: true,
    })
    expect(await stateOf(store)).toEqual({ 2: 'synced', 3: 'synced' })
  })

  it('keeps a row acked at a newer revision than the pull', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    const { transport } = fakeTransport({
      put: () => ({ liftRevision: 9 }),
      pages: () => ({ items: [], next: null, liftRevision: 8 }),
    })
    const sync = createLiftSync({ store, transport })
    await sync.flush()
    await sync.pull()
    expect(await stateOf(store)).toEqual({ 1: 'synced' })
  })

  it('a failed page applies nothing', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1)], 4, true)
    const { transport } = fakeTransport({
      pages: (cursor) => {
        if (cursor !== null) throw new LiftTransportError('other')
        return { items: [make(2)], next: 'p2', liftRevision: 5 }
      },
    })
    expect(await createLiftSync({ store, transport }).pull()).toMatchObject({ failed: true })
    expect(await stateOf(store)).toEqual({ 1: 'synced' })
  })

  it('sync pulls when the revision moved and not when it did not', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    const fake = fakeTransport({
      put: () => ({ liftRevision: 5 }),
      pages: () => ({ items: [], next: null, liftRevision: 6 }),
    })
    const sync = createLiftSync({ store, transport: fake.transport, pulledRevision: 5 })
    expect((await sync.sync()).pull).toBeNull()
    expect((await sync.sync(6)).pull).toMatchObject({ complete: true })
    expect((await sync.sync(6)).pull).toBeNull()
  })
})

describe('adoption', () => {
  it('sends device sets insertOnly, counts the keys the account kept and removes the device rows', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    await device.save(make(2))
    const account = openLiftStore('u1')
    const { transport, calls } = fakeTransport({
      put: () => ({ liftRevision: 3, skipped: [key(2)] }),
    })
    const result = await createLiftSync({ store: account, transport }).adopt(device)
    expect(calls).toEqual([{ type: 'put', orders: [1, 2], insertOnly: true }])
    expect(result).toEqual({ sent: 2, skipped: 1, done: true })
    expect(await device.list()).toEqual([])
  })

  it('keeps the device rows when a request fails', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    const { transport } = fakeTransport({ put: () => new LiftTransportError('other') })
    const result = await createLiftSync({ store: openLiftStore('u1'), transport }).adopt(device)
    expect(result).toEqual({ sent: 0, skipped: 0, done: false })
    expect(await device.list()).toHaveLength(1)
  })
})

describe('the backoff', () => {
  it('doubles from two seconds up to five minutes', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([2_000, 4_000, 8_000, 16_000])
    expect(retryDelayMs(50)).toBe(300_000)
  })
})

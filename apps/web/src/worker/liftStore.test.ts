import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { liftSetKey } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLifts, clearScope, openLiftStore, sweepLifts } from './liftStore'
import { make } from './liftTestKit'

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

describe('the lift store', () => {
  it('saves, edits and deletes with rev + 1, and lists by scope', async () => {
    const mine = openLiftStore('u1')
    const other = openLiftStore('u2')
    await mine.save(make(1))
    await mine.save(make(1, 65))
    await other.save(make(1))
    const [row] = await mine.list()
    expect(await mine.list()).toHaveLength(1)
    expect(row).toMatchObject({ state: 'put', rev: 2, set: make(1, 65) })
    await mine.remove(liftSetKey(make(1)))
    expect((await mine.list())[0]).toMatchObject({ state: 'delete', rev: 3 })
    expect(await mine.pendingCount()).toBe(1)
    expect(await other.list()).toHaveLength(1)
  })

  it('applies an ack only when the rev still matches', async () => {
    const store = openLiftStore('u1')
    const key = liftSetKey(make(1))
    await store.save(make(1))
    await store.save(make(1, 70))
    await store.applyAck(key, 1, 5)
    expect((await store.list())[0]).toMatchObject({ state: 'put', rev: 2 })
    await store.applyAck(key, 2, 6)
    expect((await store.list())[0]).toMatchObject({
      state: 'synced',
      saved: make(1, 70),
      ackRevision: 6,
    })
  })

  it('counts a refused put with nothing confirmed as not saved', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    expect(await store.applyRefused([{ key: liftSetKey(make(1)), rev: 1 }])).toBe(1)
    expect(await store.list()).toEqual([])
  })

  it('holds a failed send with attempts + 1; a new edit starts again, and a stale hold leaves it', async () => {
    const store = openLiftStore('u1')
    const key = liftSetKey(make(1))
    await store.save(make(1))
    await store.applyHeld([{ key, rev: 1 }])
    expect((await store.list())[0]).toMatchObject({ state: 'put', rev: 1, attempts: 1 })
    await store.save(make(1, 70))
    await store.applyHeld([{ key, rev: 1 }])
    expect((await store.list())[0]).toMatchObject({ state: 'put', rev: 2, attempts: 0 })
  })

  it('settles a row only while it still holds that rev', async () => {
    const store = openLiftStore('device')
    const key = liftSetKey(make(1))
    await store.save(make(1))
    await store.save(make(1, 70))
    await store.settle(key, 1)
    expect(await store.list()).toHaveLength(1)
    await store.settle(key, 2)
    expect(await store.list()).toEqual([])
  })

  it('sign-out removes synced rows and keeps unsent ones', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1), make(2)], 4, true)
    await store.save(make(3))
    await store.remove(liftSetKey(make(2)))
    await store.signOut()
    const rows = await store.list()
    expect(rows.map((row) => [row.set.setOrder, row.state]).sort()).toEqual([
      [2, 'delete'],
      [3, 'put'],
    ])
    expect(await store.pendingCount()).toBe(2)
  })

  it('the sweep removes every other account, unsent rows included, spares the device scope and an empty scope', async () => {
    await openLiftStore('u1').save(make(1))
    await openLiftStore('u2').save(make(1))
    await openLiftStore('device').save(make(1))
    await sweepLifts('')
    expect(await openLiftStore('u2').list()).toHaveLength(1)
    await sweepLifts('u1')
    expect(await openLiftStore('u1').list()).toHaveLength(1)
    expect(await openLiftStore('u2').list()).toHaveLength(0)
    expect(await openLiftStore('device').list()).toHaveLength(1)
  })

  it('a delete in the device scope removes the row, since no server needs telling', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    await device.remove(liftSetKey(make(1)))
    expect(await device.list()).toEqual([])
    const account = openLiftStore('u1')
    await account.applyPull([make(1)], 2, true)
    await account.remove(liftSetKey(make(1)))
    expect((await account.list())[0]?.state).toBe('delete')
  })

  it('a save whose write aborts resolves false and leaves nothing', async () => {
    const store = openLiftStore('u1')
    const unclonable = { ...make(1), loadKg: () => 1 } as unknown as LiftSet
    expect(await store.save(unclonable)).toBe(false)
    expect(await store.list()).toEqual([])
  })

  it('clear all removes every scope', async () => {
    await openLiftStore('u1').save(make(1))
    await openLiftStore('device').save(make(1))
    expect(await clearLifts()).toBe(true)
    expect(await openLiftStore('u1').list()).toHaveLength(0)
    expect(await openLiftStore('device').list()).toHaveLength(0)
  })

  it('a pull replaces synced rows, leaves unsent ones and, when complete, drops what it lacks', async () => {
    const store = openLiftStore('u1')
    await store.applyPull([make(1), make(2)], 4, true)
    await store.save(make(3))
    await store.applyPull([make(1, 99)], 5, true)
    const rows = await store.list()
    expect(rows.map((row) => row.set.setOrder).sort()).toEqual([1, 3])
    expect(rows.find((row) => row.set.setOrder === 1)?.set.loadKg).toBe(99)
    await store.applyPull([], 6, false)
    expect(await store.list()).toHaveLength(2)
  })

  it('a pull never removes a row confirmed at a newer revision', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    await store.applyAck(liftSetKey(make(1)), 1, 9)
    await store.applyPull([], 8, true)
    expect(await store.list()).toHaveLength(1)
    await store.applyPull([], 9, true)
    expect(await store.list()).toHaveLength(0)
  })
})

describe('closing and clearing a scope', () => {
  it('clears one scope and keeps the rest, and reopens after close', async () => {
    const device = openLiftStore('device')
    const mine = openLiftStore('u1')
    await device.save(make(1))
    await mine.save(make(1))
    device.close()
    expect(await clearScope('device')).toBe(true)
    expect(await device.list()).toEqual([])
    expect(await mine.list()).toHaveLength(1)
  })
})

describe('the sweep with nobody signed in', () => {
  it('removes every account’s synced rows, keeps its unsent rows and the device, and makes no database', async () => {
    await sweepLifts(null)
    expect(await indexedDB.databases()).toEqual([])
    const u1 = openLiftStore('u1')
    await u1.save(make(1))
    await u1.save(make(2))
    await u1.applyAck(liftSetKey(make(1)), 1, 4)
    await openLiftStore('device').save(make(1))
    await sweepLifts(null)
    expect((await u1.list()).map((row) => [row.set.setOrder, row.state])).toEqual([[2, 'put']])
    expect(await openLiftStore('device').list()).toHaveLength(1)
  })
})

describe('saving at the next set order', () => {
  it('takes one past the highest, counting delete rows, and never repeats across stores on one database', async () => {
    const a = openLiftStore('u1')
    const b = openLiftStore('u1')
    const draft = {
      date: '2031-01-05',
      exercise: 'squat',
      equipment: 'barbell',
      reps: 5,
      loadKg: 60,
    } as const
    const taken = await Promise.all([
      a.saveNext(draft),
      b.saveNext(draft),
      a.saveNext(draft),
      b.saveNext(draft),
    ])
    expect(taken.map((set) => set?.setOrder).sort()).toEqual([1, 2, 3, 4])
    expect(await a.list()).toHaveLength(4)
    await a.remove(liftSetKey({ ...draft, setOrder: 4 }))
    expect((await b.saveNext(draft))?.setOrder).toBe(5)
  })
})

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { liftSetKey } from '@rca/core/lift'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLifts, openLiftStore, sweepLifts } from './liftStore'
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

  it('the sweep removes every other scope, unsent rows included, and spares an empty scope', async () => {
    await openLiftStore('u1').save(make(1))
    await openLiftStore('u2').save(make(1))
    await openLiftStore('device').save(make(1))
    await sweepLifts(null)
    await sweepLifts('')
    expect(await openLiftStore('u2').list()).toHaveLength(1)
    await sweepLifts('u1')
    expect(await openLiftStore('u1').list()).toHaveLength(1)
    expect(await openLiftStore('u2').list()).toHaveLength(0)
    expect(await openLiftStore('device').list()).toHaveLength(0)
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

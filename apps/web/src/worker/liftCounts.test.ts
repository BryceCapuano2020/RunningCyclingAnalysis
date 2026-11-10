import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deviceLiftCount, unsentLifts } from './liftCounts'
import { openLiftStore } from './liftStore'
import { make } from './liftTestKit'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

describe('lift counts', () => {
  it('counts nothing, and makes no database, where none exists', async () => {
    expect(await unsentLifts('u1')).toBe(0)
    expect(await deviceLiftCount()).toBe(0)
    expect(await indexedDB.databases()).toEqual([])
  })

  it('counts an account’s unsent sets and the sets kept signed out, each in its own scope', async () => {
    const mine = openLiftStore('u1')
    await mine.save(make(1))
    await mine.save(make(2))
    mine.close()
    const device = openLiftStore('device')
    await device.save(make(1))
    device.close()
    expect(await unsentLifts('u1')).toBe(2)
    expect(await unsentLifts('u2')).toBe(0)
    expect(await deviceLiftCount()).toBe(1)
  })
})

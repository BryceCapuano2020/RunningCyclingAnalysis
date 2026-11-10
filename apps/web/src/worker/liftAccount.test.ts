import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { liftSetKey } from '@rca/core/lift'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dropLiftScope, signOutLifts } from './liftAccount'
import { openLiftStore } from './liftStore'
import type { LockProvider } from './liftSync'
import { make } from './liftTestKit'

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

/** A lock that records when it is held, so work can be checked to run inside it. */
function recordingLocks() {
  const log: string[] = []
  const locks: LockProvider = {
    request: async (name, work) => {
      log.push(`take ${name}`)
      try {
        return await work()
      } finally {
        log.push('release')
      }
    },
  }
  return { locks, log }
}

async function seed() {
  const store = openLiftStore('u1')
  await store.save(make(1))
  await store.save(make(2))
  await store.applyAck(liftSetKey(make(1)), 1, 4)
  return store
}

describe('lifting sets at sign-out', () => {
  it('removes the confirmed sets and keeps the unsent ones, under the flush lock', async () => {
    const store = await seed()
    const { locks, log } = recordingLocks()
    await signOutLifts('u1', locks)
    expect(log).toEqual(['take rca-lifts-flush', 'release'])
    const left = await openLiftStore('u1').list()
    expect(left.map((row) => [row.set.setOrder, row.state])).toEqual([[2, 'put']])
    expect(store).toBeDefined()
  })

  it('drops a deleted account’s whole scope, and no other', async () => {
    await seed()
    await openLiftStore('u2').save(make(1))
    const { locks, log } = recordingLocks()
    await dropLiftScope('u1', locks)
    expect(log).toEqual(['take rca-lifts-flush', 'release'])
    expect(await openLiftStore('u1').list()).toEqual([])
    expect(await openLiftStore('u2').list()).toHaveLength(1)
  })
})

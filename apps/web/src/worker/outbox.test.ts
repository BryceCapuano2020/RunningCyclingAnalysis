import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workoutKeyOf } from './device'
import {
  clearOutbox,
  digestOf,
  MAX_ATTEMPTS,
  openOutbox,
  sweepOutbox,
  waitingCount,
} from './outbox'

const [firstActivity, secondActivity] = sampleDataset().activities
const FIRST = digestActivity(firstActivity!)
const SECOND = digestActivity(secondActivity!)
const item = (digest: typeof FIRST, hash = 'a'.repeat(64)) => ({
  digest,
  fileName: `${digest.id}.fit`,
  fileHash: hash,
})

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

describe('the outbox', () => {
  it('keeps what a save began with, the most recent activity first', async () => {
    const [older, newer] = FIRST.startMs <= SECOND.startMs ? [FIRST, SECOND] : [SECOND, FIRST]
    const outbox = openOutbox('u1')
    await outbox.add(item(older))
    await outbox.add(item(newer))

    const rows = await outbox.pending()

    expect(rows.map((row) => row.key)).toEqual([workoutKeyOf(newer), workoutKeyOf(older)])
    expect(rows[0]).toMatchObject({ userId: 'u1', fileHash: 'a'.repeat(64), attempts: 0 })
    expect(digestOf(rows[1]!)).toEqual(older)
  })

  it('lists rows of one start time as they were written, after any more recent', async () => {
    const outbox = openOutbox('u1')
    const base = { ...FIRST, startMs: 2_000_000_000_000 }
    const a = { ...base, id: 'tie-a', sport: 'run' as const }
    const b = { ...base, id: 'tie-b', sport: 'ride' as const }
    await outbox.add(item(SECOND))
    await outbox.add(item(a))
    await outbox.add(item(b))

    const ids = (await outbox.pending()).map((row) => row.digestId)

    expect(ids).toEqual(['tie-a', 'tie-b', SECOND.id])
  })

  it('lists a row an earlier version wrote, with no start time, after the dated ones and in write order', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(SECOND))
    // A row as the version before start times were kept wrote it: no startMs.
    const legacy = (seq: number, digestId: string) => ({
      id: `u1|legacy-${seq}`,
      userId: 'u1',
      key: `legacy-${seq}`,
      digestId,
      seq,
      digestJson: '{}',
      fileName: 'old.fit',
      fileHash: 'c'.repeat(64),
      attempts: 0,
    })
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('rca-outbox', 1)
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    await new Promise<void>((resolve, reject) => {
      const write = database.transaction('rows', 'readwrite')
      write.objectStore('rows').put(legacy(1_000_001, 'old-b'))
      write.objectStore('rows').put(legacy(1_000_000, 'old-a'))
      write.oncomplete = () => resolve()
      write.onerror = () => reject(write.error)
    })
    database.close()
    await outbox.add(item({ ...FIRST, startMs: 2_000_000_000_000 }))

    const ids = (await outbox.pending()).map((row) => row.digestId)

    expect(ids).toEqual([FIRST.id, SECOND.id, 'old-a', 'old-b'])
  })

  it('writes a workout once: a second write replaces the first', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(FIRST, 'a'.repeat(64)))
    await outbox.add(item(FIRST, 'b'.repeat(64)))

    const rows = await outbox.pending()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.fileHash).toBe('b'.repeat(64))
  })

  it('removes a row once the server has the activity', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(FIRST))
    await outbox.done(workoutKeyOf(FIRST))
    expect(await outbox.pending()).toEqual([])
  })

  it('counts a failed resume, and lets the row go after the fifth', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(FIRST))
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect(await outbox.failed(workoutKeyOf(FIRST))).toBe(false)
      expect((await outbox.pending())[0]?.attempts).toBe(i)
    }
    expect(await outbox.failed(workoutKeyOf(FIRST))).toBe(true)
    expect(await outbox.pending()).toEqual([])
  })

  it('removes only the row that holds the digest asked for', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(FIRST))
    const replacement = { ...FIRST, id: `${FIRST.id}-again` }
    // The file is added again while the first save is on its way: the row now holds the new digest.
    await outbox.add(item(replacement, 'b'.repeat(64)))

    await outbox.done(workoutKeyOf(FIRST), FIRST.id)
    expect((await outbox.pending()).map((row) => row.digestId)).toEqual([replacement.id])

    await outbox.done(workoutKeyOf(FIRST), replacement.id)
    expect(await outbox.pending()).toEqual([])
  })

  it('counts a failure only against the row that holds the digest asked for', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(FIRST))

    expect(await outbox.failed(workoutKeyOf(FIRST), 'someone-elses-digest')).toBe(false)
    expect((await outbox.pending())[0]?.attempts).toBe(0)

    await outbox.failed(workoutKeyOf(FIRST), FIRST.id)
    expect((await outbox.pending())[0]?.attempts).toBe(1)
  })

  it('clears every account’s rows for Remove all', async () => {
    const alice = openOutbox('alice')
    const bob = openOutbox('bob')
    await alice.add(item(FIRST))
    await bob.add(item(SECOND))

    expect(await clearOutbox()).toBe(true)

    expect(await alice.pending()).toEqual([])
    expect(await bob.pending()).toEqual([])
  })

  it('sweeps every account’s rows but the signed-in one’s, and nothing while nobody is signed in or the id is empty', async () => {
    const alice = openOutbox('alice')
    const bob = openOutbox('bob')
    await alice.add(item(FIRST))
    await alice.add(item(SECOND))
    await bob.add(item(FIRST))

    await sweepOutbox(null)
    expect(await alice.pending()).toHaveLength(2)
    await sweepOutbox('')
    expect(await alice.pending()).toHaveLength(2)
    expect(await bob.pending()).toHaveLength(1)

    await sweepOutbox('bob')
    expect(await alice.pending()).toEqual([])
    expect(await bob.pending()).toHaveLength(1)
  })

  it('settles when the sweep is aborted or fails', async () => {
    // No rows, so the aborted transaction has nothing for the sweep to continue over.
    const openCursor = IDBObjectStore.prototype.openCursor

    // The transaction is aborted as the sweep reads: the browser ended it (quota, a closing tab).
    IDBObjectStore.prototype.openCursor = function (this: IDBObjectStore, ...args) {
      const request = openCursor.apply(this, args)
      this.transaction.abort()
      return request
    }
    try {
      await expect(sweepOutbox('bob')).resolves.toBeUndefined()
    } finally {
      IDBObjectStore.prototype.openCursor = openCursor
    }

    // The transaction reports an error as the sweep reads.
    IDBObjectStore.prototype.openCursor = function (this: IDBObjectStore, ...args) {
      const request = openCursor.apply(this, args)
      const transaction = this.transaction
      queueMicrotask(() => transaction.onerror?.call(transaction, new Event('error')))
      return request
    }
    try {
      await expect(sweepOutbox('bob')).resolves.toBeUndefined()
    } finally {
      IDBObjectStore.prototype.openCursor = openCursor
    }
  })

  it('sweeps nothing, and does not reject, where storage is not offered', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(sweepOutbox('bob')).resolves.toBeUndefined()
  })

  it('has nothing to clear where storage is not offered', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(clearOutbox()).resolves.toBe(true)
  })

  it('keeps each account’s rows apart, and forgets only the account’s own', async () => {
    const alice = openOutbox('alice')
    const bob = openOutbox('bob')
    await alice.add(item(FIRST))
    await bob.add(item(FIRST))
    await bob.add(item(SECOND))

    await bob.forget()

    expect((await alice.pending()).map((row) => row.userId)).toEqual(['alice'])
    expect(await bob.pending()).toEqual([])
    expect(await waitingCount('alice')).toBe(1)
  })

  it('does not read a row it cannot make a digest of', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(FIRST))
    const [row] = await outbox.pending()
    expect(digestOf({ ...row!, digestJson: '{"version":99}' })).toBeNull()
  })

  it('never rejects where storage is not offered, and holds nothing', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const outbox = openOutbox('u1')
    await expect(outbox.add(item(FIRST))).resolves.toBeUndefined()
    await expect(outbox.pending()).resolves.toEqual([])
    await expect(outbox.done('x')).resolves.toBeUndefined()
    await expect(outbox.failed('x')).resolves.toBe(false)
    await expect(outbox.forget()).resolves.toBeUndefined()
  })
})

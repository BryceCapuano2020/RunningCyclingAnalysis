import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workoutKeyOf } from './device'
import { digestOf, MAX_ATTEMPTS, openOutbox, waitingCount } from './outbox'

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
  it('keeps what a save began with, in the order it was written', async () => {
    const outbox = openOutbox('u1')
    await outbox.add(item(SECOND))
    await outbox.add(item(FIRST))

    const rows = await outbox.pending()

    expect(rows.map((row) => row.key)).toEqual([workoutKeyOf(SECOND), workoutKeyOf(FIRST)])
    expect(rows[0]).toMatchObject({ userId: 'u1', fileHash: 'a'.repeat(64), attempts: 0 })
    expect(digestOf(rows[1]!)).toEqual(FIRST)
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

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The index of files already read, over a fresh fake IndexedDB as a new browser profile would have. */
async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const store = await import('./checkinStore')
  const index = await import('./heldIndex')
  return { ...store, ...index }
}

const FILE = { hash: 'a'.repeat(64), size: 1000, meta: 'csv:Run|0|Morning' }
const KEYS = ['run-1714548600']
const allow = () => Promise.resolve(true)

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('the index of files already read', () => {
  it('knows a file after it was noted and flushed, in a later import of the same scope only', async () => {
    const m = await fresh()
    const first = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    expect(await first.files.skip(FILE)).toBeNull()
    first.files.note(FILE, KEYS)
    // Within the import it is known at once, from memory; nothing is stored until the flush.
    expect(await first.files.skip(FILE)).toEqual(KEYS)
    expect(await first.flush()).toBe(true)

    const later = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    expect(await later.files.skip(FILE)).toEqual(KEYS)
    const other = await m.openHeldIndex({ scope: 'account:u1', fileCount: 5, allows: allow })
    expect(await other.files.skip(FILE)).toBeNull()
  })

  it('asks for each hash below the bulk threshold and reads the scope once above it', async () => {
    const m = await fresh()
    const writer = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    writer.files.note(FILE, KEYS)
    await writer.flush()
    const gets = vi.spyOn(IDBObjectStore.prototype, 'get')
    const cursors = vi.spyOn(IDBObjectStore.prototype, 'openCursor')
    const short = await m.openHeldIndex({
      scope: 'device',
      fileCount: m.HELD_BULK_FILES - 1,
      allows: allow,
    })
    expect(await short.files.skip(FILE)).toEqual(KEYS)
    expect(gets).toHaveBeenCalledTimes(1)
    expect(cursors).not.toHaveBeenCalled()
    gets.mockClear()
    const long = await m.openHeldIndex({
      scope: 'device',
      fileCount: m.HELD_BULK_FILES,
      allows: allow,
    })
    expect(await long.files.skip(FILE)).toEqual(KEYS)
    expect(cursors).toHaveBeenCalledTimes(1)
    expect(gets).not.toHaveBeenCalled()
    // An unknown count is read in bulk too.
    const unknown = await m.openHeldIndex({ scope: 'device', fileCount: null, allows: allow })
    expect(await unknown.files.skip(FILE)).toEqual(KEYS)
  })

  it('does not know a file whose bytes, size, list metadata or model revision differ', async () => {
    const m = await fresh()
    const index = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    index.files.note(FILE, KEYS)
    await index.flush()
    const later = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    expect(await later.files.skip({ ...FILE, hash: 'b'.repeat(64) })).toBeNull()
    expect(await later.files.skip({ ...FILE, size: 1001 })).toBeNull()
    expect(await later.files.skip({ ...FILE, meta: 'csv:Run|0|Evening' })).toBeNull()
    expect(await later.files.skip(FILE)).toEqual(KEYS)
    // An entry written under another model revision is not trusted.
    const db = (await m.openCheckinDb())!
    const tx = db.transaction('held', 'readwrite')
    tx.objectStore('held').put(
      { size: FILE.size, keys: KEYS, revision: MODEL_REVISION - 1, meta: FILE.meta },
      `device|${FILE.hash}`,
    )
    await new Promise((resolve) => (tx.oncomplete = resolve))
    const stale = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    expect(await stale.files.skip(FILE)).toBeNull()
  })

  it('leaves a file to be read when the worker owes its workouts something', async () => {
    const m = await fresh()
    const writer = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    writer.files.note(FILE, KEYS)
    await writer.flush()
    const owed = await m.openHeldIndex({
      scope: 'device',
      fileCount: 5,
      allows: () => Promise.resolve(false),
    })
    expect(await owed.files.skip(FILE)).toBeNull()
  })

  it('forgets the file of a deleted activity, and only that scope', async () => {
    const m = await fresh()
    for (const scope of ['device', 'account:u1'] as const) {
      const index = await m.openHeldIndex({ scope, fileCount: 5, allows: allow })
      index.files.note(FILE, KEYS)
      index.files.note({ ...FILE, hash: 'c'.repeat(64) }, ['run-1714600000'])
      await index.flush()
    }
    await m.forgetHeldKeys('device', KEYS)
    const device = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    expect(await device.files.skip(FILE)).toBeNull()
    expect(await device.files.skip({ ...FILE, hash: 'c'.repeat(64) })).toEqual(['run-1714600000'])
    const account = await m.openHeldIndex({ scope: 'account:u1', fileCount: 5, allows: allow })
    expect(await account.files.skip(FILE)).toEqual(KEYS)
  })

  it('is inert where storage cannot be opened, and learns nothing', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()
    const m = await import('./heldIndex')
    const index = await m.openHeldIndex({ scope: 'device', fileCount: 5, allows: allow })
    index.files.note(FILE, KEYS)
    expect(await index.files.skip(FILE)).toBeNull()
    expect(await index.flush()).toBe(true)
  })
})

describe('the check-in database', () => {
  it('makes all three stores at version 1, so a later change needs no version bump', async () => {
    const m = await fresh()
    const db = (await m.openCheckinDb())!
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames].sort()).toEqual(['held', 'marks', 'seen'])
  })

  it('clears a scope from every store and leaves the others, without making a database for a visitor with none', async () => {
    const m = await fresh()
    await m.clearCheckinScope('device')
    expect((await indexedDB.databases()).some((d) => d.name === m.CHECKIN_DB)).toBe(false)

    const db = (await m.openCheckinDb())!
    const tx = db.transaction(['marks', 'seen', 'held'], 'readwrite')
    for (const scope of ['device', 'account:u1', 'account:u2']) {
      tx.objectStore('marks').put({ v: 1 }, scope)
      tx.objectStore('seen').put({ v: 1 }, scope)
      tx.objectStore('held').put(
        { size: 1, keys: [], revision: 1, meta: '' },
        `${scope}|${'d'.repeat(64)}`,
      )
    }
    await new Promise((resolve) => (tx.oncomplete = resolve))
    expect(await m.clearCheckinScope('account:u1')).toBe(true)
    expect((await m.accountsWithCheckin()).sort()).toEqual(['account:u2'])
    const read = db.transaction(['marks', 'held'], 'readonly')
    const left = await new Promise<number>((resolve) => {
      const r = read.objectStore('held').count()
      r.onsuccess = () => resolve(r.result)
    })
    expect(left).toBe(2)
  })

  it("sweeps every other account's rows when a different user signs in, and keeps the device's", async () => {
    const m = await fresh()
    const db = (await m.openCheckinDb())!
    const tx = db.transaction(['marks'], 'readwrite')
    for (const scope of ['device', 'account:u1', 'account:u2'])
      tx.objectStore('marks').put({ v: 1 }, scope)
    await new Promise((resolve) => (tx.oncomplete = resolve))
    await m.sweepCheckin('u2')
    expect((await m.accountsWithCheckin()).sort()).toEqual(['account:u2'])
    await m.sweepCheckin(null)
    expect(await m.accountsWithCheckin()).toEqual([])
    const left = await new Promise<unknown[]>((resolve) => {
      const r = db.transaction('marks', 'readonly').objectStore('marks').getAllKeys()
      r.onsuccess = () => resolve(r.result)
    })
    expect(left).toEqual(['device'])
  })
})

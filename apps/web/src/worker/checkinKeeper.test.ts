import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { DAY_MS } from '@rca/core/constants'
import type { CheckInSnapshot } from '@rca/core/lookback'
import { encodeSeconds } from '@rca/core/lookback'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 5, 1, 9)

/** A snapshot of runs started at the given days before T0, taken at `atMs`. Synthetic. */
function snap(days: number[], atMs: number): CheckInSnapshot {
  const seconds = days.map((d) => Math.round((T0 - d * DAY_MS) / 1000)).sort((a, b) => a - b)
  return {
    v: 1,
    revision: MODEL_REVISION,
    atMs,
    asOfMs: Math.max(0, ...seconds) * 1000,
    keys: { run: encodeSeconds(seconds), ride: '' },
    counts: { run: seconds.length, ride: 0 },
    bests: { run: [], ride: [] },
    fitness: { run: null, ride: null },
    episodes: { run: [], ride: [] },
  }
}

/** The keeper and the store over a fresh fake IndexedDB, with a clock the test moves. */
async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const store = await import('./checkinStore')
  const marks = await import('./checkinMarks')
  const { CheckInKeeper } = await import('./checkinKeeper')
  const clock = { now: T0 }
  const keeper = () => new CheckInKeeper(() => clock.now)
  return { ...store, ...marks, keeper, clock }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

const COMPLETE = { manifest: 'complete', added: 1 } as const

describe('the baseline of "since your last import"', () => {
  it('is none after a first import, the library before it after a later one', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    expect(await keeper.view('device', () => snap([5, 4], T0))).toEqual({
      checkIn: null,
      seen: false,
    })
    const before = snap([5, 4], T0)
    m.clock.now = T0 + 7 * HOUR
    await keeper.begin('device', before)
    await keeper.settle('device', COMPLETE)
    const view = await keeper.view('device', () => snap([5, 4, 1], m.clock.now))
    expect(view.checkIn?.added.run).toBe(1)
    expect(view.checkIn?.sinceMs).toBe(T0)
    expect(view.seen).toBe(false)
  })

  it('stays where it was for an import within six hours of the last, and moves for one after', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    // A first import made in several drops is still a first import.
    m.clock.now = T0 + 5 * HOUR + 59 * 60_000
    await keeper.begin('device', snap([5], T0))
    await keeper.settle('device', COMPLETE)
    expect((await keeper.view('device', () => snap([5, 4], m.clock.now))).checkIn).toBeNull()
    // The next, six hours after that one, is a new baseline.
    m.clock.now += 6 * HOUR
    await keeper.begin('device', snap([5, 4], T0))
    await keeper.settle('device', COMPLETE)
    expect((await keeper.view('device', () => snap([5, 4, 1], m.clock.now))).checkIn).not.toBeNull()
  })

  it('moves when a partial import is accepted, and not before; an interrupted one moves nothing', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    m.clock.now = T0 + 8 * HOUR
    await keeper.begin('device', snap([5], T0))
    await keeper.settle('device', { manifest: 'partial-source', added: 2 })
    await keeper.settle('device', { manifest: 'interrupted', added: 2 })
    expect((await keeper.view('device', () => snap([5, 1], m.clock.now))).checkIn).toBeNull()
    m.clock.now += 3 * HOUR
    await keeper.settle('device', { manifest: 'accepted-partial', added: 2 })
    const view = await keeper.view('device', () => snap([5, 2, 1], m.clock.now))
    expect(view.checkIn?.added.run).toBe(2)
  })

  it('is kept by a reload and not shared with another scope', async () => {
    const m = await fresh()
    const first = m.keeper()
    await first.begin('device', null)
    await first.settle('device', COMPLETE)
    m.clock.now = T0 + 8 * HOUR
    await first.begin('device', snap([5], T0))
    await first.settle('device', COMPLETE)
    const reloaded = m.keeper()
    const live = () => snap([5, 1], m.clock.now)
    expect((await reloaded.view('device', live)).checkIn?.added.run).toBe(1)
    expect((await reloaded.view('account:u1', live)).checkIn).toBeNull()
  })

  it('is dropped by a rebuild, and by a baseline of another model revision', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    m.clock.now = T0 + 8 * HOUR
    await keeper.begin('device', snap([5], T0))
    await keeper.settle('device', COMPLETE)
    const live = () => snap([5, 1], m.clock.now)
    expect((await keeper.view('device', live)).checkIn).not.toBeNull()
    m.clock.now += HOUR
    await keeper.rebuilt('device')
    expect((await keeper.view('device', live)).checkIn).toBeNull()
    // The drop is kept: a reload does not bring it back.
    expect((await m.keeper().view('device', live)).checkIn).toBeNull()
    // A dropped baseline does not join: the next import inside the window writes a fresh one.
    m.clock.now += HOUR
    await keeper.begin('device', snap([5, 1], m.clock.now))
    await keeper.settle('device', COMPLETE)
    expect(
      (await keeper.view('device', () => snap([5, 1, 0.5], m.clock.now))).checkIn?.added.run,
    ).toBe(1)
  })

  it('writes nothing for a session with no scope, such as the sample', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin(null, snap([5], T0))
    await keeper.settle(null, COMPLETE)
    expect(await keeper.markSeen(null, 'checkIn', 'open')).toBe(false)
    expect(await keeper.view(null, () => snap([5], T0))).toEqual({ checkIn: null, seen: false })
    const databases = await indexedDB.databases()
    expect(databases.some((d) => d.name === 'rca-checkin')).toBe(false)
  })

  it('keeps the first library and adds the workouts when a first import is made in two drops during the lookup', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin(null, null)
    keeper.noteProvisionalAdded(3)
    // The second drop begins with the library the first one made: that is not the library before the import.
    await keeper.begin(null, snap([5, 4, 3], T0))
    keeper.noteProvisionalAdded(2)
    await keeper.adopt('device')
    // Still a first import: no baseline, though the second drop began with the first one's files.
    expect((await m.readScope('device'))?.marks?.baseline).toBeNull()
    m.clock.now = T0 + 9 * HOUR
    await keeper.begin('device', snap([5, 4, 3], T0))
    await keeper.settle('device', COMPLETE)
    // Had the second snapshot stood, the first import would have had a baseline of its own files.
    const view = await keeper.view('device', () => snap([5, 4, 3, 1], m.clock.now))
    expect(view.checkIn?.added.run).toBe(1)
    expect((await m.readScope('device'))?.marks?.baseline?.counts.run).toBe(3)
  })

  it('drops files analysed with no scope when they are not going to be kept', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin(null, snap([5], T0))
    keeper.noteProvisionalAdded(3)
    keeper.dropProvisional()
    await keeper.adopt('device')
    expect((await m.readScope('device'))?.marks).toBeNull()
  })

  it('does not move the baseline for an acceptance when nothing is waiting', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    m.clock.now = T0 + 8 * HOUR
    await keeper.begin('device', snap([5], T0))
    await keeper.settle('device', COMPLETE)
    const baseline = (await m.readScope('device'))?.marks?.baseline
    expect(baseline).not.toBeNull()
    // The athlete accepts after a reload that lost the import: there is no pending snapshot to commit.
    m.clock.now += 9 * HOUR
    await m.keeper().settle('device', { manifest: 'accepted-partial', added: 1 })
    expect((await m.readScope('device'))?.marks?.baseline).toEqual(baseline)
  })

  it('commits files kept after being analysed with no scope, under the scope that kept them', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin(null, null)
    keeper.noteProvisionalAdded(3)
    await keeper.adopt('device')
    // That was a first import. A later one has the library of this one as its baseline.
    m.clock.now = T0 + 9 * HOUR
    await keeper.begin('device', snap([5], T0))
    await keeper.settle('device', COMPLETE)
    expect((await keeper.view('device', () => snap([5, 1], m.clock.now))).checkIn).not.toBeNull()
  })
})

describe('what the athlete has seen', () => {
  async function withCheckIn() {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    m.clock.now = T0 + 8 * HOUR
    await keeper.begin('device', snap([5], T0))
    await keeper.settle('device', COMPLETE)
    return { ...m, keep: keeper, live: () => snap([5, 1], m.clock.now) }
  }

  it('counts a row seen when it is opened, hidden, or shown on two page loads', async () => {
    const m = await withCheckIn()
    expect(await m.keep.markSeen('device', 'checkIn', 'impression')).toBe(false)
    expect(await m.keep.markSeen('device', 'checkIn', 'impression')).toBe(true)
    expect((await m.keep.view('device', m.live)).seen).toBe(true)
    const other = await withCheckIn()
    expect(await other.keep.markSeen('device', 'checkIn', 'open')).toBe(true)
    const hidden = await withCheckIn()
    expect(await hidden.keep.markSeen('device', 'checkIn', 'hide')).toBe(true)
  })

  it('starts again with the next baseline, and is kept by a reload', async () => {
    const m = await withCheckIn()
    await m.keep.markSeen('device', 'checkIn', 'hide')
    expect((await m.keeper().view('device', m.live)).seen).toBe(true)
    m.clock.now += 8 * HOUR
    await m.keep.begin('device', snap([5, 1], m.clock.now))
    await m.keep.settle('device', COMPLETE)
    expect((await m.keep.view('device', () => snap([5, 1, 0.2], m.clock.now))).seen).toBe(false)
  })

  it('is created without any marks: a signed-in library opened on a device with no baseline', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    await keeper.markSeen('account:u1', 'lookBack', 'impression')
    const records = await m.readScope('account:u1')
    expect(records?.marks).toBeNull()
    expect(records?.seen.lookBack.impressions).toBe(1)
  })
})

describe('clearing', () => {
  it('removes the records; an import that ends after the clear cannot bring the baseline back', async () => {
    const m = await fresh()
    const running = m.keeper()
    await running.begin('device', null)
    await running.settle('device', COMPLETE)
    m.clock.now = T0 + 8 * HOUR
    await running.begin('device', snap([5], T0))
    // Another tab empties the library while this import runs.
    expect(await m.clearCheckinScope('device')).toBe(true)
    expect((await m.readScope('device'))?.marks).toBeNull()
    await running.settle('device', COMPLETE)
    const after = await m.readScope('device')
    expect(after?.marks).toBeNull()
    expect(after?.epoch).toBe(1)
  })

  it('refuses a write made under the epoch from before the clear', async () => {
    const m = await fresh()
    const stale = m.keeper()
    await stale.markSeen('device', 'lookBack', 'open')
    expect(await m.clearCheckinScope('device')).toBe(true)
    await stale.markSeen('device', 'lookBack', 'impression')
    expect((await m.readScope('device'))?.seen.lookBack.impressions).toBe(0)
  })

  it('leaves an account no epoch row when it is swept or deleted, and a cleared device keeps its count', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    for (const scope of ['device', 'account:u1', 'account:u2'] as const) {
      await keeper.begin(scope, null)
      await keeper.settle(scope, COMPLETE)
    }
    // Signing out clears an account and keeps its count; a sweep for another sign-in and a deletion leave nothing.
    await m.clearCheckinScope('account:u1')
    await m.clearCheckinScope('device')
    await m.sweepCheckin('u3')
    await m.clearCheckinScope('account:u2', { dropEpoch: true })
    const keys = await new Promise<string[]>((resolve) => {
      const open = indexedDB.open('rca-checkin')
      open.onsuccess = () => {
        const all = open.result.transaction('marks', 'readonly').objectStore('marks').getAllKeys()
        all.onsuccess = () => resolve(all.result.map(String))
      }
    })
    expect(keys).toEqual(['device|epoch'])
  })

  it('is swept for another account and keeps the device and the signed-in account', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    for (const scope of ['device', 'account:u1', 'account:u2'] as const) {
      await keeper.begin(scope, null)
      await keeper.settle(scope, COMPLETE)
    }
    await m.sweepCheckin('u1')
    expect((await m.readScope('device'))?.marks).not.toBeNull()
    expect((await m.readScope('account:u1'))?.marks).not.toBeNull()
    expect((await m.readScope('account:u2'))?.marks).toBeNull()
  })
})

describe('the row "Your years"', () => {
  it('is seen once hidden, and not by being opened or shown again, and is not the check-in row', async () => {
    const m = await fresh()
    const keeper = m.keeper()
    expect(await keeper.markSeen('device', 'lookBack', 'open')).toBe(false)
    for (let load = 0; load < 3; load++) {
      expect(await keeper.markSeen('device', 'lookBack', 'impression')).toBe(false)
    }
    const hidden = m.keeper()
    expect(await hidden.markSeen('account:u1', 'lookBack', 'hide')).toBe(true)
    // The check-in row is a separate record: it needs a baseline, and the years' flags do not make it seen.
    expect(await hidden.markSeen('account:u1', 'checkIn', 'open')).toBe(false)
  })

  it('is told with the view even when there is no baseline, and kept across a reload', async () => {
    const m = await fresh()
    await m.keeper().markSeen('device', 'lookBack', 'hide')
    expect(await m.keeper().view('device', () => snap([5], T0))).toEqual({
      checkIn: null,
      seen: false,
      lookBackSeen: true,
    })
    expect(await m.keeper().view('account:other', () => snap([5], T0))).toEqual({
      checkIn: null,
      seen: false,
    })
  })
})

describe('storage that cannot be used', () => {
  it('behaves as a first visit and does not throw', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()
    const { CheckInKeeper } = await import('./checkinKeeper')
    const keeper = new CheckInKeeper(() => T0)
    await keeper.begin('device', null)
    await keeper.settle('device', COMPLETE)
    expect(await keeper.view('device', () => snap([5], T0))).toEqual({ checkIn: null, seen: false })
    // The flags are kept for the tab: "Your years" hidden is seen, and the view says so with no check-in.
    expect(await keeper.markSeen('device', 'lookBack', 'hide')).toBe(true)
    expect(await keeper.view('device', () => snap([5], T0))).toEqual({
      checkIn: null,
      seen: false,
      lookBackSeen: true,
    })
  })
})

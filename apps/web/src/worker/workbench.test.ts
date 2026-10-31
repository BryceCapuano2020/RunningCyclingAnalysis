import { traceQualityOf } from '@rca/core/quality'
import { activityTraceOf, parseActivityTrace } from '@rca/core/workbench'
import type { ActivityTrace } from '@rca/core/workbench'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity } from '@rca/core/types'
import { describe, expect, it, vi } from 'vitest'
import { digestActivity } from '@rca/core/digest'
import { matchOriginalActivity } from './originalActivity'
import { Workbench } from './workbench'
import type { PutResult, TraceScope, WorkbenchStore } from './workbenchStore'
import { activityTraceBytes, WORKBENCH_ENTRY_BYTES, WORKBENCH_TOTAL_BYTES } from './workbenchStore'

function scopeKey(scope: TraceScope, id: string): string {
  return JSON.stringify([scope.kind === 'device' ? 'device' : scope.userId, id])
}

/** A workbench that has read the device scope's epoch, as the worker's does when it loads the library. */
async function watched(store: WorkbenchStore): Promise<Workbench> {
  const workbench = new Workbench(store)
  await workbench.watchDevice()
  return workbench
}

function memoryStore(overrides: Partial<WorkbenchStore> = {}) {
  const rows = new Map<string, ActivityTrace>()
  const deleted = new Set<string>()
  // The device scope's epoch, as storage keeps it: it rises when the scope is cleared.
  let deviceEpoch = 0
  const store: WorkbenchStore = {
    get: vi.fn(async (scope, id) => rows.get(scopeKey(scope, id)) ?? null),
    has: vi.fn(async (scope, id) => rows.has(scopeKey(scope, id))),
    list: vi.fn(async () => []),
    put: vi.fn(async (scope, trace, _startMs, epoch) => {
      if (scope.kind === 'device' && epoch !== undefined && epoch !== deviceEpoch) {
        return 'replaced' as const
      }
      rows.set(scopeKey(scope, trace.activityId), trace)
      return 'stored' as const
    }),
    deviceEpoch: vi.fn(async () => deviceEpoch),
    remove: vi.fn(async (scope, id) => rows.delete(scopeKey(scope, id)) || true),
    clearScope: vi.fn(async (scope) => {
      if (scope.kind === 'device') deviceEpoch++
      return true
    }),
    deleteScope: vi.fn(async () => true),
    reopenScope: vi.fn(async () => true),
    isDeleted: vi.fn(async (scope) => scope.kind === 'account' && deleted.has(scope.userId)),
    ...overrides,
  }
  return { rows, deleted, store }
}

const activities = sampleDataset().activities
const first = activities[0]!

describe('workbench evidence cache', () => {
  it('keeps account scopes separate and never falls back across owners', async () => {
    const { store } = memoryStore()
    const workbench = await watched(store)
    const trace = await workbench.capture(first, { kind: 'account', userId: 'alice' })
    expect(trace).not.toBeNull()
    workbench.clearMemory()
    expect(await workbench.get({ kind: 'account', userId: 'bob' }, first.id)).toBeNull()
    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
    expect(await workbench.get({ kind: 'account', userId: 'alice' }, first.id)).toEqual(trace)
  })

  it('keeps the seconds the quality assessment left out, for the zones on the activity page', async () => {
    const heartRate = new Float64Array(first.n).fill(150)
    heartRate[60] = 240
    const { store } = memoryStore()
    const workbench = await watched(store)
    const trace = await workbench.capture(
      { ...first, hasHeartRate: true, heartRate },
      { kind: 'device' },
    )
    expect(trace?.unusable?.heartRate?.[60]).toBe(1)
  })

  it('bounds each cached trace and drops the oldest memory entries', async () => {
    const { store } = memoryStore()
    const workbench = await watched(store)
    const oversized: Activity = {
      ...first,
      n: 600_000,
      speed: new Float64Array(600_000),
      distance: new Float64Array(600_000),
      altitude: new Float64Array(600_000),
      heartRate: new Float64Array(600_000),
      power: new Float64Array(600_000),
      paused: new Uint8Array(600_000),
    }
    expect(activityTraceBytes(activityTraceOf(oversized))).toBeGreaterThan(WORKBENCH_ENTRY_BYTES)
    await workbench.capture(oversized, { kind: 'device' })
    expect(store.put).not.toHaveBeenCalled()
    expect(await workbench.get({ kind: 'device' }, oversized.id)).toBeNull()

    for (const activity of activities.slice(0, 5))
      workbench.captureMemory(activity, { kind: 'device' })
    expect(await workbench.get({ kind: 'device' }, activities[0]!.id)).toBeNull()
    expect(await workbench.get({ kind: 'device' }, activities[4]!.id)).not.toBeNull()
  })

  it('treats a refused evidence write as optional and still keeps an in-memory trace', async () => {
    const { store } = memoryStore({ put: vi.fn(async () => 'refused' as const) })
    const workbench = await watched(store)
    const trace = await workbench.capture(first, { kind: 'device' })
    expect(trace?.activityId).toBe(first.id)
    expect(await workbench.get({ kind: 'device' }, first.id)).toEqual(trace)
  })

  it('does not serve a stored trace from memory once another tab removed it', async () => {
    const { rows, store } = memoryStore()
    const workbench = await watched(store)
    const trace = await workbench.capture(first, { kind: 'device' })
    expect(await workbench.get({ kind: 'device' }, first.id)).toEqual(trace)

    rows.clear()

    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
  })

  it('serves a memory-only trace without asking storage, since storage never held it', async () => {
    const { store } = memoryStore()
    const workbench = await watched(store)
    workbench.captureMemory(first, { kind: 'device' })

    expect(await workbench.get({ kind: 'device' }, first.id)).not.toBeNull()
    expect(store.has).not.toHaveBeenCalled()
  })

  it('keeps a signed-in trace in memory when storage cannot say whether the account was deleted', async () => {
    const { store } = memoryStore({
      isDeleted: vi.fn(async () => {
        throw new Error('storage unavailable')
      }),
    })
    const workbench = await watched(store)
    const scope = { kind: 'account' as const, userId: 'alice' }

    const trace = await workbench.capture(first, scope)

    expect(trace?.activityId).toBe(first.id)
    expect(store.put).not.toHaveBeenCalled()
    expect(await workbench.get(scope, first.id)).toEqual(trace)
  })

  it('serves a stored trace from memory when storage cannot say whether it is still there', async () => {
    const { rows, store } = memoryStore({ has: vi.fn(async () => null) })
    const workbench = await watched(store)
    const trace = await workbench.capture(first, { kind: 'device' })
    rows.clear()

    expect(await workbench.get({ kind: 'device' }, first.id)).toEqual(trace)
  })

  it('writes a trace storage could not take once storage next answers', async () => {
    let down = true
    const { rows, store } = memoryStore()
    store.isDeleted = vi.fn(async (scope) => {
      if (down) throw new Error('backing off')
      return scope.kind === 'account' && false
    })
    const workbench = await watched(store)
    const scope = { kind: 'account' as const, userId: 'alice' }
    await workbench.capture(activities[0]!, scope)
    await workbench.capture(activities[1]!, scope)
    expect(rows.size).toBe(0)

    down = false
    await workbench.capture(activities[2]!, scope)

    expect([...rows.values()].map((trace) => trace.activityId).sort()).toEqual(
      activities
        .slice(0, 3)
        .map((activity) => activity.id)
        .sort(),
    )
  })

  it('settles a pending trace by what storage says: stored, left out for newer ones, or still refused', async () => {
    let down = true
    const results: Record<string, PutResult> = {}
    const { rows, store } = memoryStore({
      put: vi.fn(async (scope, trace) => {
        const result = results[trace.activityId] ?? 'stored'
        if (result === 'stored') rows.set(scopeKey(scope, trace.activityId), trace)
        return result
      }),
    })
    store.isDeleted = vi.fn(async () => {
      if (down) throw new Error('backing off')
      return false
    })
    const workbench = await watched(store)
    const scope: TraceScope = { kind: 'device' }
    const [a, b, c, d, e] = activities
    for (const activity of [a!, b!, c!]) await workbench.capture(activity, scope)
    expect(store.put).not.toHaveBeenCalled()

    down = false
    results[a!.id] = 'stored'
    results[b!.id] = 'outranked'
    results[c!.id] = 'refused'
    await workbench.capture(d!, scope)

    expect(workbench.isStored(scope, a!.id)).toBe(true)
    expect(workbench.isStored(scope, b!.id)).toBe(false)
    expect(await workbench.holds(scope, b!.id)).toBe(true)
    expect(workbench.isStored(scope, d!.id)).toBe(true)
    vi.mocked(store.put).mockClear()

    // The left-out one is not tried again; the refused one is, and storage takes it this time.
    results[c!.id] = 'stored'
    await workbench.capture(e!, scope)
    const tried = vi.mocked(store.put).mock.calls.map(([, trace]) => trace.activityId)
    expect(tried).toContain(c!.id)
    expect(tried).not.toContain(b!.id)
    expect(workbench.isStored(scope, c!.id)).toBe(true)
    expect(rows.has(scopeKey(scope, b!.id))).toBe(false)
  })

  describe('recordings deferred to the end of an import', () => {
    const scope: TraceScope = { kind: 'device' }
    const startingAt = (id: string, startMs: number): Activity => ({ ...first, id, startMs })

    it('writes nothing until asked, then writes the newest first', async () => {
      const { rows, store } = memoryStore()
      const workbench = await watched(store)

      for (const [id, startMs] of [
        ['old', 1_000],
        ['new', 3_000],
        ['mid', 2_000],
      ] as const)
        expect(workbench.captureDeferred(startingAt(id, startMs), scope)).not.toBeNull()
      expect(store.put).not.toHaveBeenCalled()
      expect(await workbench.holds(scope, 'old')).toBe(true)

      const stored = await workbench.storeDeferred()

      expect(vi.mocked(store.put).mock.calls.map(([, trace]) => trace.activityId)).toEqual([
        'new',
        'mid',
        'old',
      ])
      expect([...stored].sort()).toEqual(['mid', 'new', 'old'])
      expect(rows.size).toBe(3)
      // Once written, nothing is left to write.
      vi.mocked(store.put).mockClear()
      await workbench.storeDeferred()
      expect(store.put).not.toHaveBeenCalled()
    })

    it('does not write one that was removed first, and reports only those storage kept', async () => {
      const { store } = memoryStore({
        put: vi.fn(async (_scope, trace) => (trace.activityId === 'full' ? 'outranked' : 'stored')),
      })
      const workbench = await watched(store)
      workbench.captureDeferred(startingAt('gone', 2_000), scope)
      workbench.captureDeferred(startingAt('full', 3_000), scope)
      workbench.captureDeferred(startingAt('kept', 4_000), scope)

      await workbench.remove(scope, 'gone')
      const stored = await workbench.storeDeferred()

      expect([...stored]).toEqual(['kept'])
      expect(vi.mocked(store.put).mock.calls.map(([, trace]) => trace.activityId)).toEqual([
        'kept',
        'full',
      ])
    })

    it('holds no more than the cache can, dropping the oldest activities first', async () => {
      const { store } = memoryStore()
      const workbench = await watched(store)
      const n = 380_000
      const big = (id: string, startMs: number): Activity => ({
        ...startingAt(id, startMs),
        n,
        speed: new Float64Array(n),
        distance: new Float64Array(n),
        altitude: new Float64Array(n),
        heartRate: new Float64Array(n),
        power: new Float64Array(n),
        paused: new Uint8Array(n),
        unrecorded: undefined,
        laps: [],
      })
      const probe = big('probe', 0)
      // The trace the cache builds carries the masks of the quality assessment too.
      const bytes = activityTraceBytes(activityTraceOf(probe, traceQualityOf(probe)))
      expect(bytes).toBeLessThanOrEqual(WORKBENCH_ENTRY_BYTES)
      const fit = Math.floor(WORKBENCH_TOTAL_BYTES / bytes)

      // One more than fits, the oldest arriving last.
      for (let i = 0; i <= fit; i++) workbench.captureDeferred(big(`a${i}`, 10_000 - i), scope)
      await workbench.storeDeferred()

      const written = vi.mocked(store.put).mock.calls.map(([, trace]) => trace.activityId)
      expect(written).toHaveLength(fit)
      expect(written).not.toContain(`a${fit}`)
      expect(written[0]).toBe('a0')
    })
  })

  describe('once storage has turned a recording away as outranked', () => {
    /** The sample's first activity under another id, started at `startMs`. */
    const startingAt = (id: string, startMs: number): Activity => ({ ...first, id, startMs })
    const scope: TraceScope = { kind: 'device' }

    async function fullOfNewer() {
      const { store } = memoryStore({ put: vi.fn(async () => 'outranked' as const) })
      return { store, workbench: await watched(store) }
    }

    it('does not offer storage a recording that started no later and is no larger', async () => {
      const { store, workbench } = await fullOfNewer()
      await workbench.capture(startingAt('a', 5_000), scope)
      expect(store.put).toHaveBeenCalledTimes(1)

      const older = await workbench.capture(startingAt('b', 4_000), scope)
      const same = await workbench.capture(startingAt('c', 5_000), scope)

      expect(store.put).toHaveBeenCalledTimes(1)
      // It is kept in memory all the same, as an outranked recording always is.
      expect(older).not.toBeNull()
      expect(same).not.toBeNull()
      expect(await workbench.get(scope, 'b')).toEqual(older)
      expect(workbench.isStored(scope, 'b')).toBe(false)
    })

    it('still offers one that started later, or is smaller', async () => {
      const { store, workbench } = await fullOfNewer()
      await workbench.capture(startingAt('a', 5_000), scope)

      await workbench.capture(startingAt('newer', 6_000), scope)
      expect(store.put).toHaveBeenCalledTimes(2)

      const smaller = startingAt('small', 4_000)
      const half = Math.floor(smaller.n / 2)
      await workbench.capture(
        {
          ...smaller,
          n: half,
          speed: smaller.speed.slice(0, half),
          distance: smaller.distance.slice(0, half),
          altitude: smaller.altitude.slice(0, half),
          heartRate: smaller.heartRate.slice(0, half),
          power: smaller.power.slice(0, half),
          paused: smaller.paused.slice(0, half),
        },
        scope,
      )
      expect(store.put).toHaveBeenCalledTimes(3)
    })

    it.each([
      ['a removal', (workbench: Workbench) => workbench.remove(scope, 'other')],
      ['clearing a scope', (workbench: Workbench) => workbench.clearScope(scope)],
      ['a new import', (workbench: Workbench) => workbench.forgetOutranked()],
      ['clearing the memory', (workbench: Workbench) => workbench.clearMemory()],
    ])('asks storage again after %s, since room may have opened up', async (_name, free) => {
      const { store, workbench } = await fullOfNewer()
      await workbench.capture(startingAt('a', 5_000), scope)
      await free(workbench)

      await workbench.capture(startingAt('b', 4_000), scope)

      expect(store.put).toHaveBeenCalledTimes(2)
    })
  })

  it('never writes a memory-only trace, and drops a pending one whose account was deleted', async () => {
    let down = true
    const { rows, deleted, store } = memoryStore()
    const isDeleted = store.isDeleted
    store.isDeleted = vi.fn(async (scope) => {
      if (down) throw new Error('backing off')
      return isDeleted(scope)
    })
    const workbench = await watched(store)
    const scope = { kind: 'account' as const, userId: 'alice' }
    workbench.captureMemory(activities[0]!, { kind: 'device' })
    await workbench.capture(activities[1]!, scope)

    down = false
    deleted.add('alice')
    await workbench.capture(activities[2]!, { kind: 'account', userId: 'bob' })

    expect(rows.size).toBe(1)
    expect([...rows.values()][0]!.activityId).toBe(activities[2]!.id)
    expect(await workbench.get(scope, activities[1]!.id)).toBeNull()
    expect(await workbench.get({ kind: 'device' }, activities[0]!.id)).not.toBeNull()
  })

  it('does not serve a pending trace whose account was deleted while it was being written', async () => {
    const { store } = memoryStore()
    const calls = { isDeleted: 0 }
    store.isDeleted = vi.fn(async () => {
      calls.isDeleted++
      // Unreachable at capture, then live for get's own check, then deleted when the write runs.
      if (calls.isDeleted <= 2) throw new Error('backing off')
      return calls.isDeleted > 3
    })
    const workbench = await watched(store)
    const scope = { kind: 'account' as const, userId: 'alice' }
    await workbench.capture(first, scope)
    expect(store.put).not.toHaveBeenCalled()

    expect(await workbench.get(scope, first.id)).toBeNull()
    expect(store.put).not.toHaveBeenCalled()
  })

  it('drops a pending trace when its activity is removed, so it is never written back', async () => {
    let down = true
    const { rows, store } = memoryStore()
    const isDeleted = store.isDeleted
    store.isDeleted = vi.fn(async (scope) => {
      if (down) throw new Error('backing off')
      return isDeleted(scope)
    })
    const workbench = await watched(store)
    await workbench.capture(first, { kind: 'device' })
    await workbench.remove({ kind: 'device' }, first.id)

    down = false
    await workbench.capture(activities[1]!, { kind: 'device' })

    expect([...rows.values()].map((trace) => trace.activityId)).toEqual([activities[1]!.id])
    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
  })

  it('knows whether a recording is kept, in storage or in memory alone', async () => {
    const { store, rows } = memoryStore()
    const workbench = await watched(store)
    const device: TraceScope = { kind: 'device' }
    expect(await workbench.holds(device, first.id)).toBe(false)

    await workbench.capture(first, device)
    expect(await workbench.holds(device, first.id)).toBe(true)
    // Another tab removed the stored copy, so the memory one no longer counts.
    rows.clear()
    expect(await workbench.holds(device, first.id)).toBe(false)

    workbench.captureMemory(first, device)
    expect(await workbench.holds(device, first.id)).toBe(true)
  })

  it('ranks a stored recording by the start of its activity', async () => {
    const { store } = memoryStore()
    const workbench = await watched(store)
    await workbench.capture(first, { kind: 'device' })
    // The fourth argument is the library's epoch, which this store reports as zero.
    expect(store.put).toHaveBeenCalledWith({ kind: 'device' }, expect.anything(), first.startMs, 0)
  })

  it('keeps a recording in memory alone when the cache is full of newer activities, and never writes it later', async () => {
    const { rows, store } = memoryStore({ put: vi.fn(async () => 'outranked' as const) })
    const workbench = await watched(store)
    const scope: TraceScope = { kind: 'device' }
    const trace = await workbench.capture(first, scope)
    expect(trace).not.toBeNull()
    expect(workbench.isStored(scope, first.id)).toBe(false)
    expect(await workbench.holds(scope, first.id)).toBe(true)
    expect(await workbench.get(scope, first.id)).toEqual(trace)

    // Storage answering a later capture does not bring the left-out one in.
    vi.mocked(store.put).mockImplementation(async (s, t) => {
      rows.set(scopeKey(s, t.activityId), t)
      return 'stored'
    })
    await workbench.capture(activities[1]!, scope)
    expect(rows.has(scopeKey(scope, first.id))).toBe(false)
    expect(store.put).toHaveBeenCalledTimes(2)
  })

  it('reports a refused removal and still drops the memory copy', async () => {
    const { store } = memoryStore({ remove: vi.fn(async () => false) })
    const workbench = await watched(store)
    await workbench.capture(first, { kind: 'device' })

    expect(await workbench.remove({ kind: 'device' }, first.id)).toBe(false)
    // The refused store still holds the trace, and the next read goes to it, not to memory.
    expect(await workbench.get({ kind: 'device' }, first.id)).not.toBeNull()
    expect(store.get).toHaveBeenCalledTimes(1)
  })

  it('round-trips unknown GPX run cadence provenance through the cache', async () => {
    const activity: Activity = {
      ...first,
      cadence: new Float32Array(first.n).fill(82),
      cadenceUnit: 'unknown',
    }
    const { store } = memoryStore()
    const workbench = await watched(store)
    const captured = await workbench.capture(activity, { kind: 'device' })
    expect(captured?.cadenceUnit).toBe('unknown')

    workbench.clearMemory()
    const restored = await workbench.get({ kind: 'device' }, activity.id)
    expect(parseActivityTrace(restored)?.cadenceUnit).toBe('unknown')
  })

  it('refuses a late write after an account scope is tombstoned', async () => {
    const { rows, deleted, store } = memoryStore({
      put: vi.fn(async (scope, trace) => {
        if (scope.kind === 'account' && deleted.has(scope.userId)) return 'refused' as const
        rows.set(scopeKey(scope, trace.activityId), trace)
        return 'stored' as const
      }),
      deleteScope: vi.fn(async (scope) => {
        deleted.add(scope.userId)
        for (const key of rows.keys()) if (key.startsWith(`["${scope.userId}"`)) rows.delete(key)
        return true
      }),
    })
    const workbench = await watched(store)
    const scope = { kind: 'account' as const, userId: 'deleted-user' }
    expect(await workbench.capture(first, scope)).not.toBeNull()
    expect(await workbench.deleteScope(scope)).toBe(true)
    expect(await workbench.capture(first, scope)).toBeNull()
    expect(await workbench.get(scope, first.id)).toBeNull()
  })

  it('rejects corrupted evidence and selects the exact matching original activity', () => {
    const trace = activityTraceOf(first)
    expect(
      parseActivityTrace({ ...trace, paused: new Uint8Array(trace.paused.length + 1) }),
    ).toBeNull()
    const sameStartWrong = { ...first, id: `${first.id}-other` }
    expect(matchOriginalActivity([sameStartWrong, first], digestActivity(first), first.id)).toBe(
      first,
    )
    expect(matchOriginalActivity([sameStartWrong], digestActivity(first), first.id)).toBeUndefined()
  })
})

describe('device recordings when the library’s epoch is not known', () => {
  const device: TraceScope = { kind: 'device' }

  it('keeps a recording in memory and writes none, when a write runs before the epoch was read', async () => {
    const { store } = memoryStore()
    const workbench = new Workbench(store)

    const trace = await workbench.capture(first, device)

    expect(trace).not.toBeNull()
    expect(store.put).not.toHaveBeenCalled()
    // It still opens for this visit.
    expect(await workbench.get(device, first.id)).toEqual(trace)
  })

  it('keeps a recording in memory and writes none, when storage would not say the epoch', async () => {
    const { store } = memoryStore({
      deviceEpoch: vi.fn(async () => {
        throw new Error('Workbench storage failed')
      }),
    })
    const workbench = new Workbench(store)
    await workbench.watchDevice()

    const trace = await workbench.capture(first, device)

    expect(store.put).not.toHaveBeenCalled()
    expect(await workbench.holds(device, first.id)).toBe(true)
    expect(await workbench.get(device, first.id)).toEqual(trace)
  })

  it('writes none of the deferred recordings either', async () => {
    const { store } = memoryStore({
      deviceEpoch: vi.fn(async () => {
        throw new Error('Workbench storage failed')
      }),
    })
    const workbench = new Workbench(store)
    await workbench.watchDevice()
    workbench.captureDeferred(first, device)

    const stored = await workbench.storeDeferred()

    expect(store.put).not.toHaveBeenCalled()
    expect(stored.size).toBe(0)
  })

  it('writes under the epoch once it is read', async () => {
    const { store } = memoryStore()
    const workbench = await watched(store)

    await workbench.capture(first, device)

    expect(store.put).toHaveBeenCalledWith(device, expect.anything(), first.startMs, 0)
  })

  it('does not write what waited for storage under an epoch read afterwards', async () => {
    const { store, rows } = memoryStore({ put: vi.fn(async () => 'refused' as const) })
    const workbench = await watched(store)
    await workbench.capture(first, device)
    // Storage was refusing, so the recording waits. The library is then loaded again and the epoch re-read.
    vi.mocked(store.put).mockImplementation(async (s, t) => {
      rows.set(scopeKey(s, t.activityId), t)
      return 'stored'
    })

    await workbench.watchDevice()
    await workbench.capture(activities[1]!, device)

    expect(rows.size).toBe(1)
    expect(await workbench.get(device, first.id)).not.toBeNull()
    expect(rows.has(scopeKey(device, first.id))).toBe(false)
  })

  it('leaves account recordings out of it', async () => {
    const { store } = memoryStore()
    const workbench = new Workbench(store)

    await workbench.capture(first, { kind: 'account', userId: 'alice' })

    expect(store.put).toHaveBeenCalledWith(
      { kind: 'account', userId: 'alice' },
      expect.anything(),
      first.startMs,
      undefined,
    )
  })
})

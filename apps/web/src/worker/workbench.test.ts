import { activityTraceOf, parseActivityTrace } from '@rca/core/workbench'
import type { ActivityTrace } from '@rca/core/workbench'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity } from '@rca/core/types'
import { describe, expect, it, vi } from 'vitest'
import { digestActivity } from '@rca/core/digest'
import { matchOriginalActivity } from './originalActivity'
import { Workbench } from './workbench'
import type { TraceScope, WorkbenchStore } from './workbenchStore'
import { activityTraceBytes, WORKBENCH_ENTRY_BYTES } from './workbenchStore'

function scopeKey(scope: TraceScope, id: string): string {
  return JSON.stringify([scope.kind === 'device' ? 'device' : scope.userId, id])
}

function memoryStore(overrides: Partial<WorkbenchStore> = {}) {
  const rows = new Map<string, ActivityTrace>()
  const deleted = new Set<string>()
  const store: WorkbenchStore = {
    get: vi.fn(async (scope, id) => rows.get(scopeKey(scope, id)) ?? null),
    has: vi.fn(async (scope, id) => rows.has(scopeKey(scope, id))),
    put: vi.fn(async (scope, trace) => {
      rows.set(scopeKey(scope, trace.activityId), trace)
      return 'stored' as const
    }),
    remove: vi.fn(async (scope, id) => rows.delete(scopeKey(scope, id)) || true),
    clearScope: vi.fn(async () => true),
    deleteScope: vi.fn(async () => true),
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
    const workbench = new Workbench(store)
    const trace = await workbench.capture(first, { kind: 'account', userId: 'alice' })
    expect(trace).not.toBeNull()
    workbench.clearMemory()
    expect(await workbench.get({ kind: 'account', userId: 'bob' }, first.id)).toBeNull()
    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
    expect(await workbench.get({ kind: 'account', userId: 'alice' }, first.id)).toEqual(trace)
  })

  it('bounds each cached trace and drops the oldest memory entries', async () => {
    const { store } = memoryStore()
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
    const trace = await workbench.capture(first, { kind: 'device' })
    expect(trace?.activityId).toBe(first.id)
    expect(await workbench.get({ kind: 'device' }, first.id)).toEqual(trace)
  })

  it('does not serve a stored trace from memory once another tab removed it', async () => {
    const { rows, store } = memoryStore()
    const workbench = new Workbench(store)
    const trace = await workbench.capture(first, { kind: 'device' })
    expect(await workbench.get({ kind: 'device' }, first.id)).toEqual(trace)

    rows.clear()

    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
  })

  it('serves a memory-only trace without asking storage, since storage never held it', async () => {
    const { store } = memoryStore()
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
    const scope = { kind: 'account' as const, userId: 'alice' }

    const trace = await workbench.capture(first, scope)

    expect(trace?.activityId).toBe(first.id)
    expect(store.put).not.toHaveBeenCalled()
    expect(await workbench.get(scope, first.id)).toEqual(trace)
  })

  it('serves a stored trace from memory when storage cannot say whether it is still there', async () => {
    const { rows, store } = memoryStore({ has: vi.fn(async () => null) })
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
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

  it('never writes a memory-only trace, and drops a pending one whose account was deleted', async () => {
    let down = true
    const { rows, deleted, store } = memoryStore()
    const isDeleted = store.isDeleted
    store.isDeleted = vi.fn(async (scope) => {
      if (down) throw new Error('backing off')
      return isDeleted(scope)
    })
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
    await workbench.capture(first, { kind: 'device' })
    await workbench.remove({ kind: 'device' }, first.id)

    down = false
    await workbench.capture(activities[1]!, { kind: 'device' })

    expect([...rows.values()].map((trace) => trace.activityId)).toEqual([activities[1]!.id])
    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
  })

  it('knows whether a recording is kept, in storage or in memory alone', async () => {
    const { store, rows } = memoryStore()
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
    await workbench.capture(first, { kind: 'device' })
    expect(store.put).toHaveBeenCalledWith({ kind: 'device' }, expect.anything(), first.startMs)
  })

  it('keeps a recording in memory alone when the cache is full of newer activities, and never writes it later', async () => {
    const { rows, store } = memoryStore({ put: vi.fn(async () => 'outranked' as const) })
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
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
    const workbench = new Workbench(store)
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

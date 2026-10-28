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
    put: vi.fn(async (scope, trace) => {
      rows.set(scopeKey(scope, trace.activityId), trace)
      return true
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

    for (const activity of activities.slice(0, 5)) workbench.captureSample(activity)
    expect(await workbench.get({ kind: 'device' }, activities[0]!.id)).toBeNull()
    expect(await workbench.get({ kind: 'device' }, activities[4]!.id)).not.toBeNull()
  })

  it('treats a refused evidence write as optional and still keeps an in-memory trace', async () => {
    const { store } = memoryStore({ put: vi.fn(async () => false) })
    const workbench = new Workbench(store)
    const trace = await workbench.capture(first, { kind: 'device' })
    expect(trace?.activityId).toBe(first.id)
    expect(await workbench.get({ kind: 'device' }, first.id)).toEqual(trace)
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
        if (scope.kind === 'account' && deleted.has(scope.userId)) return false
        rows.set(scopeKey(scope, trace.activityId), trace)
        return true
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

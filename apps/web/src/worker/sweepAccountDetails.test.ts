import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { sampleDataset } from '@rca/core/synthetic'
import { activityTraceOf } from '@rca/core/workbench'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const activity = sampleDataset().activities[0]!
const trace = activityTraceOf(activity)

/** The modules over a fresh, empty fake IndexedDB, as a new browser profile would have. */
async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const { openWorkbenchStore } = await import('./workbenchStore')
  const { sweepAccountDetails } = await import('./sweepAccountDetails')
  const store = openWorkbenchStore()
  for (const scope of [
    { kind: 'account', userId: 'alice' },
    { kind: 'account', userId: 'bob' },
    { kind: 'device' },
  ] as const) {
    await store.put(scope, trace, activity.startMs)
  }
  return { store, sweepAccountDetails }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('sweeping the accounts that are no longer this browser’s', () => {
  it('clears every account but the signed-in one, and leaves the device library', async () => {
    const { store, sweepAccountDetails } = await fresh()

    await sweepAccountDetails('bob')

    expect(await store.has({ kind: 'account', userId: 'alice' }, trace.activityId)).toBe(false)
    expect(await store.has({ kind: 'account', userId: 'bob' }, trace.activityId)).toBe(true)
    expect(await store.has({ kind: 'device' }, trace.activityId)).toBe(true)
  })

  it('clears every account when nobody is signed in, but not the signed-out library', async () => {
    const { store, sweepAccountDetails } = await fresh()

    await sweepAccountDetails(null)

    expect(await store.has({ kind: 'account', userId: 'alice' }, trace.activityId)).toBe(false)
    expect(await store.has({ kind: 'account', userId: 'bob' }, trace.activityId)).toBe(false)
    expect(await store.has({ kind: 'device' }, trace.activityId)).toBe(true)
  })

  it('does nothing without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()
    const { sweepAccountDetails } = await import('./sweepAccountDetails')
    await expect(sweepAccountDetails(null)).resolves.toBeUndefined()
  })
})

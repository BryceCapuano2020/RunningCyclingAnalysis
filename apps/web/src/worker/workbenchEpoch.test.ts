import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { sampleDataset } from '@rca/core/synthetic'
import { activityTraceOf } from '@rca/core/workbench'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraceScope } from './workbenchStore'

const [first, second] = sampleDataset().activities
const trace = activityTraceOf(first!)
const other = activityTraceOf(second!)
const DEVICE: TraceScope = { kind: 'device' }
const ALICE: TraceScope = { kind: 'account', userId: 'alice' }

async function freshStore() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const { openWorkbenchStore } = await import('./workbenchStore')
  return openWorkbenchStore()
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('the device scope’s epoch, in real storage', () => {
  it('starts at zero and rises each time the scope is cleared', async () => {
    const store = await freshStore()
    expect(await store.deviceEpoch()).toBe(0)

    await store.clearScope(DEVICE)
    expect(await store.deviceEpoch()).toBe(1)
    await store.clearScope(DEVICE)
    expect(await store.deviceEpoch()).toBe(2)
  })

  it('takes a recording written in the epoch the writer loaded', async () => {
    const store = await freshStore()
    await store.clearScope(DEVICE)

    expect(await store.put(DEVICE, trace, first!.startMs, 1)).toBe('stored')
    expect(await store.has(DEVICE, trace.activityId)).toBe(true)
  })

  it('refuses a recording begun before another tab cleared the scope, and stores nothing', async () => {
    const store = await freshStore()
    const loaded = await store.deviceEpoch()
    expect(await store.put(DEVICE, trace, first!.startMs, loaded)).toBe('stored')
    // Another tab chooses Remove all.
    await store.clearScope(DEVICE)

    expect(await store.put(DEVICE, other, second!.startMs, loaded)).toBe('replaced')

    expect(await store.list(DEVICE)).toEqual([])
    expect(await store.has(DEVICE, other.activityId)).toBe(false)
  })

  it('refuses the write that was already running when the clear began, never leaving it behind', async () => {
    const store = await freshStore()
    const writing = store.put(DEVICE, trace, first!.startMs, 0)
    const clearing = store.clearScope(DEVICE)
    const [written] = await Promise.all([writing, clearing])

    // Either order is possible; what is never possible is a recording that outlived the clear.
    expect(['stored', 'replaced']).toContain(written)
    expect(await store.list(DEVICE)).toEqual([])
  })

  it('writes without a check when no epoch is given, and leaves other scopes out of it', async () => {
    const store = await freshStore()
    await store.clearScope(DEVICE)

    expect(await store.put(DEVICE, trace, first!.startMs)).toBe('stored')
    expect(await store.put(ALICE, other, second!.startMs, 99)).toBe('stored')
  })

  it('does not raise the epoch when an account scope is cleared', async () => {
    const store = await freshStore()
    await store.clearScope(ALICE)
    expect(await store.deviceEpoch()).toBe(0)
  })
})

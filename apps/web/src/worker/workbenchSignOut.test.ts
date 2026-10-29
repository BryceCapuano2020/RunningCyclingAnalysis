import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { sampleDataset } from '@rca/core/synthetic'
import { activityTraceOf } from '@rca/core/workbench'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraceScope } from './workbenchStore'

const activity = sampleDataset().activities[0]!
const trace = activityTraceOf(activity)
const ALICE: Extract<TraceScope, { kind: 'account' }> = { kind: 'account', userId: 'alice' }

/** A store over a fresh, empty fake IndexedDB, as a new browser profile would have. */
async function freshStore() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const { openWorkbenchStore } = await import('./workbenchStore')
  return openWorkbenchStore()
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('account scope at sign-out', () => {
  it('clears the recordings and refuses a capture that finishes after the clear', async () => {
    const store = await freshStore()
    expect(await store.put(ALICE, trace, activity.startMs)).toBe('stored')

    expect(await store.clearScope(ALICE)).toBe(true)

    expect(await store.get(ALICE, trace.activityId)).toBeNull()
    expect(await store.isDeleted(ALICE)).toBe(true)
    expect(await store.put(ALICE, trace, activity.startMs)).toBe('refused')
    expect(await store.has(ALICE, trace.activityId)).toBe(false)
  })

  it('refuses a write started before the clear but finishing after it', async () => {
    const store = await freshStore()
    const writing = store.put(ALICE, trace, activity.startMs)
    const clearing = store.clearScope(ALICE)
    await Promise.all([writing, clearing])

    // Whichever order storage ran them in, nothing of the account is left behind.
    expect(await store.has(ALICE, trace.activityId)).toBe(false)
    expect(await store.put(ALICE, trace, activity.startMs)).toBe('refused')
  })

  it('writes again once the account is reopened at sign-in', async () => {
    const store = await freshStore()
    await store.clearScope(ALICE)

    expect(await store.reopenScope(ALICE)).toBe(true)

    expect(await store.isDeleted(ALICE)).toBe(false)
    expect(await store.put(ALICE, trace, activity.startMs)).toBe('stored')
  })

  it('does not block another account or the device library', async () => {
    const store = await freshStore()
    await store.clearScope(ALICE)

    expect(await store.put({ kind: 'account', userId: 'bob' }, trace, activity.startMs)).toBe(
      'stored',
    )
    expect(await store.put({ kind: 'device' }, trace, activity.startMs)).toBe('stored')
  })

  it('leaves the device library writable after it is cleared', async () => {
    const store = await freshStore()
    await store.put({ kind: 'device' }, trace, activity.startMs)
    await store.clearScope({ kind: 'device' })

    expect(await store.put({ kind: 'device' }, trace, activity.startMs)).toBe('stored')
  })

  it('keeps a deleted account blocked through a sign-out and a reopen', async () => {
    const store = await freshStore()
    await store.deleteScope(ALICE)

    await store.clearScope(ALICE)
    await store.reopenScope(ALICE)

    expect(await store.isDeleted(ALICE)).toBe(true)
    expect(await store.put(ALICE, trace, activity.startMs)).toBe('refused')
  })
})

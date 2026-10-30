import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityTrace } from '@rca/core/workbench'
import { describe, expect, it, vi } from 'vitest'
import { Workbench } from './workbench'
import type { WorkbenchStore } from './workbenchStore'

const first = sampleDataset().activities[0]!

/** A store that keeps nothing, so a trace can only be served from the workbench's own memory. */
function refusingStore(): WorkbenchStore {
  return {
    get: vi.fn(async (): Promise<ActivityTrace | null> => null),
    has: vi.fn(async () => false),
    list: vi.fn(async () => []),
    put: vi.fn(async () => 'refused' as const),
    remove: vi.fn(async () => true),
    clearScope: vi.fn(async () => true),
    deleteScope: vi.fn(async () => true),
    reopenScope: vi.fn(async () => true),
    isDeleted: vi.fn(async () => false),
  } as unknown as WorkbenchStore
}

describe('the workbench memory is keyed by account', () => {
  // The cross-account tests clear the memory before they read, which bypasses the key. Here nothing is
  // cleared, so only the key keeps one account's pending trace from another account or the device.
  it('does not hand one account a pending trace held in memory for another', async () => {
    const workbench = new Workbench(refusingStore())
    expect(await workbench.capture(first, { kind: 'account', userId: 'alice' })).not.toBeNull()
    expect(await workbench.get({ kind: 'account', userId: 'alice' }, first.id)).not.toBeNull()
    expect(await workbench.get({ kind: 'account', userId: 'bob' }, first.id)).toBeNull()
    expect(await workbench.get({ kind: 'device' }, first.id)).toBeNull()
  })
})

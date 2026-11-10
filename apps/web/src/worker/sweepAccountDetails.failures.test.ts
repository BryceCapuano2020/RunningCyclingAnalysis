import { beforeEach, describe, expect, it, vi } from 'vitest'

const swept: string[] = []
const refuse = (name: string) => async () => {
  swept.push(name)
  throw new Error(`${name} refused`)
}

vi.mock('./checkinStore', () => ({ sweepCheckin: refuse('checkin') }))
vi.mock('./outbox', () => ({ sweepOutbox: refuse('outbox') }))
vi.mock('./liftStore', () => ({ sweepLifts: refuse('lifts') }))
vi.mock('./stateStore', () => ({ sweepSnapshots: refuse('snapshots') }))
vi.mock('./workbenchExists', () => ({ workbenchExists: async () => false }))
vi.mock('./workbenchStore', () => ({
  accountsWithRecordings: async () => [],
  clearWorkbenchScope: async () => undefined,
}))

beforeEach(() => {
  swept.length = 0
  vi.stubGlobal('indexedDB', {})
})

describe('sweeping the accounts that are no longer this browser’s, where storage refuses', () => {
  it('tries every store even when one refuses, and never rejects', async () => {
    const { sweepAccountDetails } = await import('./sweepAccountDetails')
    await expect(sweepAccountDetails('bob')).resolves.toBeUndefined()
    expect(swept).toEqual(['checkin', 'outbox', 'lifts', 'snapshots'])
  })
})

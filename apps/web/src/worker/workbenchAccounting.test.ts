import { describe, expect, it } from 'vitest'
import {
  WORKBENCH_ENTRY_BYTES,
  WORKBENCH_TOTAL_BYTES,
  subtractMetadata,
  validStoreState,
  validTraceMetadata,
} from './workbenchSchema'

describe('workbench cache accounting validation', () => {
  const state = { key: 'total' as const, bytes: 30, count: 2 }
  const metadata = {
    key: '["device","activity"]',
    scopeKey: 'device',
    activityId: 'activity',
    savedAt: 1,
    bytes: 10,
  }

  it('subtracts only bounded integer metadata from a valid ledger', () => {
    expect(subtractMetadata(state, metadata)).toEqual({ key: 'total', bytes: 20, count: 1 })
    expect(subtractMetadata(state, { ...metadata, bytes: -1 })).toBeNull()
    expect(subtractMetadata(state, { ...metadata, bytes: WORKBENCH_ENTRY_BYTES + 1 })).toBeNull()
  })

  it('rejects NaN and non-integer byte counts before they reach ledger arithmetic', () => {
    const corrupted = { ...metadata, bytes: Number.NaN }
    expect(validTraceMetadata(corrupted)).toBe(false)
    expect(subtractMetadata(state, corrupted)).toBeNull()
    expect(validStoreState({ ...state, bytes: Number.NaN })).toBe(false)
    expect(subtractMetadata({ ...state, bytes: Number.NaN }, metadata)).toBeNull()
    expect(subtractMetadata(state, { ...metadata, bytes: 0.5 })).toBeNull()
  })

  it('rejects ledger values that would exceed hard bounds or underflow', () => {
    expect(validStoreState({ ...state, bytes: WORKBENCH_TOTAL_BYTES + 1 })).toBe(false)
    expect(subtractMetadata({ key: 'total', bytes: 0, count: 1 }, metadata)).toBeNull()
    expect(subtractMetadata({ key: 'total', bytes: 1, count: 0 }, metadata)).toBeNull()
  })
})

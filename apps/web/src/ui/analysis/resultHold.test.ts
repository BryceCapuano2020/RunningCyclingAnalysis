import { describe, expect, it } from 'vitest'
import { HOLD_ON_ANY_STALE, holdOf } from './resultHold'
import type { HoldInputs } from './resultHold'

const base: HoldInputs = { knowledge: 'present', hasResult: false, stale: 0, newer: 0 }

describe('holdOf', () => {
  it('holds the results while a present library has digests out and nothing to show', () => {
    expect(holdOf({ ...base, stale: 3 })).toEqual({ reason: 'updating', scope: 'results' })
    expect(holdOf({ ...base, newer: 1 })).toEqual({ reason: 'updating', scope: 'results' })
  })

  it('holds nothing when nothing is out, or the library is not present', () => {
    expect(holdOf(base)).toBeNull()
    expect(holdOf({ ...base, knowledge: 'empty', stale: 3 })).toBeNull()
    expect(holdOf({ ...base, knowledge: 'unknown', stale: 3 })).toBeNull()
  })

  it('leaves the results of the digests that are read, unless the hold on any stale digest is on', () => {
    const hold = holdOf({ ...base, hasResult: true, stale: 2 })
    expect(hold === null).toBe(!HOLD_ON_ANY_STALE)
    expect(holdOf({ ...base, hasResult: true, newer: 2 })).toBeNull()
  })
})

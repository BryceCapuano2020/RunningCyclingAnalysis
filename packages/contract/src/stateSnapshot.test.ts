import { describe, expect, it } from 'vitest'
import { StateSnapshotSchema } from './stateSnapshot.ts'

// Built by hand: the contract's program has no DOM libraries, which the session's imports need. The core test holds the real one.
const snapshot = {
  schemaVersion: 1,
  modelRevision: 7,
  libraryVersion: 2,
  nowMs: 1_750_000_000_000,
  zone: 'UTC',
  buildSha: 'abc',
  state: { result: null, trend: [{ $: 'NaN' }], records: { $: 'Map', e: [] } },
}

describe('StateSnapshotSchema', () => {
  it('accepts a snapshot after a trip through JSON, and a newer schema for the reader to leave alone', () => {
    const wire = JSON.parse(JSON.stringify(snapshot))
    expect(StateSnapshotSchema.parse(wire)).toEqual(wire)
    expect(StateSnapshotSchema.safeParse({ ...wire, schemaVersion: 2 }).success).toBe(true)
  })

  it('accepts the lift results and the check-in, and refuses them as anything but objects', () => {
    const full = { ...snapshot, liftRevision: 4, lift: { state: { lifts: [] } }, checkIn: { v: 1 } }
    expect(StateSnapshotSchema.parse(JSON.parse(JSON.stringify(full)))).toEqual(full)
    expect(StateSnapshotSchema.safeParse({ ...full, checkIn: null }).success).toBe(true)
    expect(StateSnapshotSchema.safeParse({ ...full, lift: [] }).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...full, liftRevision: 0 }).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...full, liftRevision: 1.5 }).success).toBe(false)
  })

  it('refuses a missing field, a stray one and a state that is not an object', () => {
    const { zone: _zone, ...noZone } = snapshot
    expect(StateSnapshotSchema.safeParse(noZone).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...snapshot, extra: 1 }).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...snapshot, state: [] }).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...snapshot, libraryVersion: -1 }).success).toBe(false)
  })
})

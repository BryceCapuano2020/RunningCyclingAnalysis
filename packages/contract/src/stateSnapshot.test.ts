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

  const checkIn = {
    v: 1,
    revision: 7,
    atMs: 1_750_000_000_000,
    asOfMs: 1_749_000_000_000,
    keys: { run: 'a,b', ride: '' },
    counts: { run: 2, ride: 0 },
    bests: {
      run: [
        {
          effort: { kind: 'duration', durationS: 300 },
          unit: 'm/s',
          value: 4.5,
          atMs: 1_749_000_000_000,
          key: 'run-1',
        },
      ],
      ride: [],
    },
  }
  const lift = {
    today: '2026-03-20',
    state: { revision: 4, lifts: [{ key: 'a.barbell' }], weeks: [] },
    histories: {},
    windows: {},
    order: [],
    lead: null,
    bigThree: { kind: 'none', parts: [] },
    bigThreeGrades: [],
    corner: { kind: 'gap', why: 'no-profile' },
    levels: { metric: null, imperial: null },
  }
  const full = { ...snapshot, liftRevision: 4, lift, checkIn }
  const ok = (value: unknown) => StateSnapshotSchema.safeParse(value).success

  it('accepts the lift results and the check-in after a trip through JSON, and a null check-in', () => {
    expect(StateSnapshotSchema.parse(JSON.parse(JSON.stringify(full)))).toEqual(full)
    expect(ok({ ...full, checkIn: null })).toBe(true)
    expect(ok(snapshot)).toBe(true)
  })

  it('bounds the check-in: its counts, instants, sports and bests', () => {
    const bad = (change: object) => ok({ ...full, checkIn: { ...checkIn, ...change } })
    expect(bad({ v: 2 })).toBe(false)
    expect(bad({ atMs: -1 })).toBe(false)
    expect(bad({ atMs: 1.5 })).toBe(false)
    expect(bad({ revision: 0 })).toBe(false)
    expect(bad({ counts: { run: -1 } })).toBe(false)
    expect(bad({ counts: { run: 'many' } })).toBe(false)
    expect(bad({ keys: { run: 'x'.repeat(2_000_001) } })).toBe(false)
    expect(bad({ extra: 1 })).toBe(false)
    expect(bad({ bests: { run: Array.from({ length: 257 }, () => checkIn.bests.run[0]) } })).toBe(
      false,
    )
    expect(bad({ bests: { run: [{ ...checkIn.bests.run[0], unit: 'furlongs' }] } })).toBe(false)
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`s${i}`, 1]))
    expect(bad({ counts: many })).toBe(false)
  })

  it('requires the lift results a date and a state with bounded top-level fields', () => {
    const bad = (change: object) => ok({ ...full, lift: { ...lift, ...change } })
    expect(bad({ today: '20 March' })).toBe(false)
    expect(bad({ today: undefined })).toBe(false)
    expect(bad({ state: { ...lift.state, revision: 0 } })).toBe(false)
    expect(
      bad({ state: { ...lift.state, lifts: Array.from({ length: 1_001 }, () => ({})) } }),
    ).toBe(false)
    expect(bad({ state: { ...lift.state, weeks: 'none' } })).toBe(false)
    expect(bad({ order: Array.from({ length: 1_001 }, () => 'a.barbell') })).toBe(false)
    expect(bad({ extra: 1 })).toBe(false)
    expect(ok({ ...full, lift: [] })).toBe(false)
    expect(ok({ ...full, liftRevision: 0 })).toBe(false)
    expect(ok({ ...full, liftRevision: 1.5 })).toBe(false)
  })

  it('refuses a missing field, a stray one and a state that is not an object', () => {
    const { zone: _zone, ...noZone } = snapshot
    expect(StateSnapshotSchema.safeParse(noZone).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...snapshot, extra: 1 }).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...snapshot, state: [] }).success).toBe(false)
    expect(StateSnapshotSchema.safeParse({ ...snapshot, libraryVersion: -1 }).success).toBe(false)
  })
})

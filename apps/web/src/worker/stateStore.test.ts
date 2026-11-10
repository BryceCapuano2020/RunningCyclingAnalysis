import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshotAt } from '../test/stateCopyKit'
import {
  DEVICE_STATE_SCOPE,
  clearSnapshot,
  readSnapshot,
  sweepSnapshots,
  writeSnapshot,
} from './stateStore'
import { sweepAccountDetails } from './sweepAccountDetails'

const NOW = Date.UTC(2026, 5, 1, 12)
const snapshot = snapshotAt(NOW)

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('indexedDB', new IDBFactory())
})

async function holders(): Promise<string[]> {
  const scopes = [DEVICE_STATE_SCOPE, 'alice', 'bob']
  const found = await Promise.all(scopes.map((scope) => readSnapshot(scope)))
  return scopes.filter((_, i) => found[i] !== null)
}

describe('the state store (rca-state)', () => {
  it('keeps the last snapshot of each scope apart', async () => {
    await writeSnapshot('alice', snapshot)
    await writeSnapshot('alice', snapshotAt(NOW + 1))
    await writeSnapshot('bob', snapshotAt(NOW + 2))
    expect((await readSnapshot('alice'))?.nowMs).toBe(NOW + 1)
    expect((await readSnapshot('bob'))?.nowMs).toBe(NOW + 2)
    expect(await readSnapshot(DEVICE_STATE_SCOPE)).toBeNull()
  })

  it('reads without making the database', async () => {
    expect(await readSnapshot('alice')).toBeNull()
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('rca-state')
  })

  it('ignores and deletes a snapshot of another shape, model or analysis revision', async () => {
    await writeSnapshot('alice', { ...snapshot, schemaVersion: snapshot.schemaVersion + 1 })
    await writeSnapshot('bob', { ...snapshot, modelRevision: MODEL_REVISION + 1 })
    await writeSnapshot('carol', { ...snapshot, analysisRevision: ANALYSIS_REVISION - 1 })
    await writeSnapshot('device', snapshot)
    expect(await readSnapshot('alice')).toBeNull()
    expect(await readSnapshot('bob')).toBeNull()
    // Made before a change to how a figure is worked out: stale, so it is not painted.
    expect(await readSnapshot('carol')).toBeNull()
    // Gone, not just skipped: a build that matches it later would not find it either.
    await writeSnapshot('alice', snapshot)
    expect(await readSnapshot('alice')).not.toBeNull()
    expect(await holders()).toEqual(['device', 'alice'])
  })

  it('clears one scope and leaves the rest', async () => {
    for (const scope of [DEVICE_STATE_SCOPE, 'alice', 'bob']) await writeSnapshot(scope, snapshot)
    expect(await clearSnapshot('alice')).toBe(true)
    expect(await holders()).toEqual([DEVICE_STATE_SCOPE, 'bob'])
  })

  it('sweeps every account but the signed-in one, and never the device', async () => {
    for (const scope of [DEVICE_STATE_SCOPE, 'alice', 'bob']) await writeSnapshot(scope, snapshot)
    await sweepSnapshots('bob')
    expect(await holders()).toEqual([DEVICE_STATE_SCOPE, 'bob'])
    await sweepSnapshots(null)
    expect(await holders()).toEqual([DEVICE_STATE_SCOPE])
  })

  it('sweeps nothing for an empty scope, and is swept with the other stores', async () => {
    await writeSnapshot('alice', snapshot)
    await sweepSnapshots('')
    expect(await holders()).toEqual(['alice'])
    await sweepAccountDetails('bob')
    expect(await holders()).toEqual([])
  })

  it('holds nothing where storage is missing, without rejecting', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await readSnapshot('alice')).toBeNull()
    expect(await writeSnapshot('alice', snapshot)).toBe(false)
    expect(await clearSnapshot('alice')).toBe(true)
    await expect(sweepSnapshots(null)).resolves.toBeUndefined()
  })
})

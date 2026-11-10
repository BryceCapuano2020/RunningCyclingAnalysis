import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resultState, snapshotAt } from '../../test/stateCopyKit'
import * as api from '../../api/state'
import * as lifts from '../../worker/liftCounts'
import * as outbox from '../../worker/outbox'
import { noteChoice, resetUnsent } from '../settingsUnsent'
import { hasUnsentWork, newerServerCopy } from './serverCopy'

vi.mock('../../api/state', () => ({ getServerSnapshot: vi.fn() }))
vi.mock('../../worker/liftCounts', () => ({ unsentLifts: vi.fn() }))
vi.mock('../../worker/outbox', () => ({ waitingCount: vi.fn() }))

const get = vi.mocked(api.getServerSnapshot)
const sets = vi.mocked(lifts.unsentLifts)
const waiting = vi.mocked(outbox.waitingCount)
const NOW = 1_800_000_000_000

beforeEach(() => {
  resetUnsent()
  get.mockReset()
  sets.mockReset().mockResolvedValue(0)
  waiting.mockReset().mockResolvedValue(0)
})

describe('hasUnsentWork', () => {
  it('is false when nothing is waiting', async () => {
    expect(await hasUnsentWork('u1')).toBe(false)
  })

  it('is true for each kind of work this device has not sent', async () => {
    waiting.mockResolvedValueOnce(2)
    expect(await hasUnsentWork('u1')).toBe(true)
    sets.mockResolvedValueOnce(1)
    expect(await hasUnsentWork('u1')).toBe(true)
    noteChoice()
    expect(await hasUnsentWork('u1')).toBe(true)
  })

  it('reads storage that fails as nothing waiting', async () => {
    waiting.mockRejectedValueOnce(new Error('no storage'))
    sets.mockRejectedValueOnce(new Error('no storage'))
    expect(await hasUnsentWork('u1')).toBe(false)
  })
})

describe('newerServerCopy', () => {
  it('gives the server’s state when there is no device copy, or it is older', async () => {
    const snapshot = snapshotAt(NOW, 'UTC')
    get.mockResolvedValue(snapshot)
    const first = await newerServerCopy('u1', null)
    expect(first?.snapshot).toBe(snapshot)
    expect(first?.state.totalActivities).toBe(resultState().totalActivities)
    expect(await newerServerCopy('u1', NOW - 1)).not.toBeNull()
  })

  it('leaves a device copy that is as new or newer', async () => {
    get.mockResolvedValue(snapshotAt(NOW, 'UTC'))
    expect(await newerServerCopy('u1', NOW)).toBeNull()
    expect(await newerServerCopy('u1', NOW + 1)).toBeNull()
  })

  it('is null where the server is off for the account, and for any failure', async () => {
    get.mockResolvedValueOnce(null)
    expect(await newerServerCopy('u1', null)).toBeNull()
    get.mockRejectedValueOnce(new Error('offline'))
    expect(await newerServerCopy('u1', null)).toBeNull()
  })

  it('refuses a snapshot of another shape or model, or one that does not decode', async () => {
    const snapshot = snapshotAt(NOW, 'UTC')
    get.mockResolvedValueOnce({ ...snapshot, schemaVersion: snapshot.schemaVersion + 1 })
    expect(await newerServerCopy('u1', null)).toBeNull()
    get.mockResolvedValueOnce({ ...snapshot, modelRevision: MODEL_REVISION + 1 })
    expect(await newerServerCopy('u1', null)).toBeNull()
    get.mockResolvedValueOnce({ ...snapshot, state: { $: 'Bogus' } })
    expect(await newerServerCopy('u1', null)).toBeNull()
  })

  it('asks nothing while work is unsent, and drops the answer when work appears meanwhile', async () => {
    waiting.mockResolvedValueOnce(1)
    expect(await newerServerCopy('u1', null)).toBeNull()
    expect(get).not.toHaveBeenCalled()
    get.mockResolvedValue(snapshotAt(NOW, 'UTC'))
    waiting.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    expect(await newerServerCopy('u1', null)).toBeNull()
    expect(get).toHaveBeenCalledTimes(1)
  })
})

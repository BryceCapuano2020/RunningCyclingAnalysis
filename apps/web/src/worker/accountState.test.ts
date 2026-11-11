import type { CheckInSnapshot } from '@rca/core/lookback'
import { toSnapshot } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateRead } from '../api/state'
import { resultState } from '../test/stateCopyKit'
import { accountCheckIn } from './accountState'

const served = vi.hoisted(() => ({ read: null as (() => Promise<unknown>) | null }))
vi.mock('../api/state', () => ({ readServerState: () => served.read?.() }))
const device = vi.hoisted(() => ({ copy: null as StateSnapshot | null }))
vi.mock('./stateStore', () => ({ readSnapshot: async () => device.copy }))

const checkIn = (atMs: number) => ({ v: 1, atMs, counts: {} }) as unknown as CheckInSnapshot
const snapshot = (check: CheckInSnapshot | null | undefined): StateSnapshot => ({
  ...toSnapshot(
    resultState(),
    { libraryVersion: 1, nowMs: 1_000, zone: 'UTC', buildSha: 'x' },
    check === undefined ? undefined : { lift: {} as never, checkIn: check },
  ),
})
const answer = (read: StateRead) => (served.read = async () => read)

beforeEach(() => {
  served.read = null
  device.copy = null
})

describe('the check-in an account’s import compares with', () => {
  it('is the one in the snapshot the server serves now', async () => {
    const fresh = checkIn(5)
    answer({ kind: 'snapshot', snapshot: snapshot(fresh), nowMs: 1, current: true })
    device.copy = snapshot(checkIn(1))
    expect(await accountCheckIn('u1', true)).toEqual(fresh)
    expect(await accountCheckIn('u1', false)).toEqual(fresh)
  })

  it('is null for an empty library, which a first import starts from', async () => {
    answer({ kind: 'snapshot', snapshot: snapshot(null), nowMs: 1, current: true })
    expect(await accountCheckIn('u1', true)).toBeNull()
  })

  it('falls back to the device copy for the baseline while the server computes, and never for the library after the import', async () => {
    device.copy = snapshot(checkIn(1))
    answer({ kind: 'computing', retryAfterMs: 2_000 })
    expect(await accountCheckIn('u1', true)).toEqual(checkIn(1))
    expect(await accountCheckIn('u1', false)).toBeUndefined()
  })

  it('has none when the server cannot answer and no copy is held, or the copy carries no check-in', async () => {
    served.read = async () => {
      throw new Error('offline')
    }
    expect(await accountCheckIn('u1', true)).toBeUndefined()
    device.copy = snapshot(undefined)
    expect(await accountCheckIn('u1', true)).toBeUndefined()
  })

  it('does not read a snapshot of another build', async () => {
    const other = { ...snapshot(checkIn(9)), modelRevision: 0 }
    answer({ kind: 'snapshot', snapshot: other, nowMs: 1, current: true })
    expect(await accountCheckIn('u1', false)).toBeUndefined()
  })
})

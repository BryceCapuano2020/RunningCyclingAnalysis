// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../test/fakeWorker'
import { resultState, snapshotAt } from '../test/stateCopyKit'
import { readSnapshot, writeSnapshot } from '../worker/stateStore'
import { setKeptLibraryHinted } from './analysis/keptLibrary'
import { DEVICE_GRACE_MS, useAnalysis } from './useAnalysis'
import type { AccountStatus } from './useAccount'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const ME: Me = {
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: false,
    birthYear: null,
    sex: null,
    updatedAt: 1000,
  },
}
interface Account {
  status: AccountStatus
  me: Me | null
}
const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN: Account = { status: 'signed-in', me: ME }

const worker = (): FakeWorker => FakeWorker.instances.at(-1)!
const withCount = (totalActivities: number): SessionState => ({ ...resultState(), totalActivities })
const DAY_MS = 86_400_000

function setup(account: Account) {
  return renderHook(({ account }: { account: Account }) => useAnalysis(SETTINGS, account), {
    initialProps: { account },
  })
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setKeptLibraryHinted(false)
})

describe('the device copy on open', () => {
  it('paints the last results before the live analysis has answered', async () => {
    await writeSnapshot('device', snapshotAt(Date.now(), 'UTC', withCount(41)))
    const { result } = setup(LOADING)
    expect(result.current.state.result).toBeNull()
    await waitFor(() => expect(result.current.state.totalActivities).toBe(41))
    expect(result.current.state.result).not.toBeNull()
    expect(FakeWorker.instances.flatMap((w) => w.posted)).toEqual([])
  })

  it('shows the live analysis over the copy as soon as the worker answers', async () => {
    await writeSnapshot('device', snapshotAt(Date.now(), 'UTC', withCount(41)))
    setKeptLibraryHinted(true)
    const { result } = setup(SIGNED_OUT)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(41))
    act(() => worker().reply({ type: 'state', state: withCount(43) }))
    expect(result.current.state.totalActivities).toBe(43)
    expect(result.current.copyStale).toBeUndefined()
  })

  it('marks a copy from an earlier local day stale, and one from today fresh', async () => {
    await writeSnapshot('device', snapshotAt(Date.now() - 2 * DAY_MS, 'UTC', withCount(41)))
    const old = setup(SIGNED_OUT)
    await waitFor(() => expect(old.result.current.state.totalActivities).toBe(41))
    expect(old.result.current.copyStale).toBe(true)
    old.unmount()

    await writeSnapshot('device', snapshotAt(Date.now(), 'UTC', withCount(42)))
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    await writeSnapshot('device', snapshotAt(Date.now(), zone, withCount(42)))
    const fresh = setup(SIGNED_OUT)
    await waitFor(() => expect(fresh.result.current.state.totalActivities).toBe(42))
    expect(fresh.result.current.copyStale).toBe(false)
  })

  it('ignores and deletes a copy of another version, and shows nothing', async () => {
    const snapshot = snapshotAt(Date.now(), 'UTC', withCount(41))
    await writeSnapshot('device', { ...snapshot, schemaVersion: 99 })
    const { result } = setup(SIGNED_OUT)
    await waitFor(async () => expect(await readSnapshot('device')).toBeNull())
    expect(result.current.state.result).toBeNull()
  })

  it('paints an account its own copy, and never the device library’s', async () => {
    await writeSnapshot('device', snapshotAt(Date.now(), 'UTC', withCount(11)))
    await writeSnapshot('u1', snapshotAt(Date.now(), 'UTC', withCount(22)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(22))
    // The account's copy stands until the server answers, whatever the worker sends meanwhile: it builds no results for an account.
    expect(worker().posted.map((request) => request.type)).toContain('loadServer')
    act(() => worker().reply({ type: 'state', state: withCount(23) }))
    expect(result.current.state.totalActivities).toBe(22)
  })

  it('shows an account with no copy of its own the restoring state, not the device’s results', async () => {
    await writeSnapshot('device', snapshotAt(Date.now(), 'UTC', withCount(11)))
    const { result } = setup(SIGNED_IN)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(result.current.state.result).toBeNull()
  })

  it('drops a copy whose account is no longer signed in', async () => {
    await writeSnapshot('u1', snapshotAt(Date.now(), 'UTC', withCount(22)))
    const { result, rerender } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(22))
    rerender({ account: SIGNED_OUT })
    await waitFor(() => expect(result.current.state.result).toBeNull())
  })
})

describe('keeping the copy', () => {
  async function liveDevice(state: SessionState) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setKeptLibraryHinted(true)
    const hook = setup(SIGNED_OUT)
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS))
    act(() => worker().reply({ type: 'state', state }))
    return hook
  }

  it('keeps the live results once they stand still, for a signed-out visitor', async () => {
    await liveDevice(withCount(5))
    expect(await readSnapshot('device')).toBeNull()
    act(() => vi.advanceTimersByTime(2_000))
    await vi.waitFor(async () => expect((await readSnapshot('device'))?.zone).toBeTruthy())
  })

  it('leaves no copy for a library with no results, and takes the last one away', async () => {
    await writeSnapshot('device', snapshotAt(Date.now(), 'UTC', withCount(41)))
    await liveDevice({ ...withCount(0), result: null })
    act(() => vi.advanceTimersByTime(2_000))
    await vi.waitFor(async () => expect(await readSnapshot('device')).toBeNull())
  })

  it('keeps nothing of the sample', async () => {
    await liveDevice({ ...withCount(5), isSample: true })
    act(() => vi.advanceTimersByTime(2_000))
    vi.useRealTimers()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(await readSnapshot('device')).toBeNull()
  })

  it('never keeps a state the browser computed for an account', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    setup(SIGNED_IN)
    act(() => worker().reply({ type: 'state', state: withCount(9) }))
    act(() => vi.advanceTimersByTime(2_000))
    vi.useRealTimers()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(await readSnapshot('u1')).toBeNull()
    expect(await readSnapshot('device')).toBeNull()
  })
})

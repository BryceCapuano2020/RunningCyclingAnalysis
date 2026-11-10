// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/state'
import { FakeWorker } from '../test/fakeWorker'
import { resultState, snapshotAt } from '../test/stateCopyKit'
import * as outbox from '../worker/outbox'
import { readSnapshot, writeSnapshot } from '../worker/stateStore'
import { setKeptLibraryHinted } from './analysis/keptLibrary'
import { noteChoice, resetUnsent } from './settingsUnsent'
import { useAnalysis } from './useAnalysis'
import type { AccountStatus } from './useAccount'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)
vi.mock('../api/state', () => ({ getServerSnapshot: vi.fn() }))
vi.mock('../worker/outbox', async (original) => ({
  ...(await original<typeof outbox>()),
  waitingCount: vi.fn(),
}))

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
  serverState: true,
}
interface Account {
  status: AccountStatus
  me: Me | null
}
const SIGNED_IN: Account = { status: 'signed-in', me: ME }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const DAY_MS = 86_400_000
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const get = vi.mocked(api.getServerSnapshot)
const waiting = vi.mocked(outbox.waitingCount)
const worker = (): FakeWorker => FakeWorker.instances.at(-1)!
const withCount = (totalActivities: number): SessionState => ({ ...resultState(), totalActivities })

function setup(account: Account) {
  return renderHook(({ account }: { account: Account }) => useAnalysis(SETTINGS, account), {
    initialProps: { account },
  })
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('indexedDB', new IDBFactory())
  get.mockReset()
  waiting.mockReset().mockResolvedValue(0)
  resetUnsent()
})

afterEach(() => {
  vi.unstubAllGlobals()
  setKeptLibraryHinted(false)
})

describe('the server snapshot on open (signed in, results computed on the server)', () => {
  it('paints it for a device with no copy, and keeps it as the device copy', async () => {
    const now = Date.now()
    get.mockResolvedValue(snapshotAt(now, ZONE, withCount(61)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    expect(result.current.copyStale).toBe(false)
    await waitFor(async () => expect((await readSnapshot('u1'))?.nowMs).toBe(now))
    // The digests still load for the live analysis.
    expect(worker().posted.map((request) => request.type)).toContain('loadServer')
  })

  it('replaces an older device copy, and the live analysis then replaces it', async () => {
    await writeSnapshot('u1', snapshotAt(Date.now() - 1000, ZONE, withCount(22)))
    get.mockResolvedValue(snapshotAt(Date.now(), ZONE, withCount(61)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    act(() => worker().reply({ type: 'state', state: withCount(63) }))
    expect(result.current.state.totalActivities).toBe(63)
    expect(result.current.copyStale).toBeUndefined()
  })

  it('leaves a device copy that is newer than the server’s', async () => {
    await writeSnapshot('u1', snapshotAt(Date.now(), ZONE, withCount(22)))
    get.mockResolvedValue(snapshotAt(Date.now() - 1000, ZONE, withCount(61)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(22))
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(result.current.state.totalActivities).toBe(22)
    expect((await readSnapshot('u1'))?.nowMs).toBeLessThanOrEqual(Date.now())
  })

  it('shows a snapshot from an earlier local day as stale, and the live analysis replaces it', async () => {
    get.mockResolvedValue(snapshotAt(Date.now() - 2 * DAY_MS, ZONE, withCount(61)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    expect(result.current.copyStale).toBe(true)
    act(() => worker().reply({ type: 'state', state: withCount(64) }))
    expect(result.current.state.totalActivities).toBe(64)
    expect(result.current.copyStale).toBeUndefined()
  })

  it('shows a snapshot cut in another zone as stale: the days moved', async () => {
    get.mockResolvedValue(snapshotAt(Date.now(), 'Pacific/Apia', withCount(61)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    expect(result.current.copyStale).toBe(true)
  })

  it('is not shown, or kept, once the live analysis has answered first', async () => {
    let answer: (snapshot: ReturnType<typeof snapshotAt>) => void = () => undefined
    get.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(get).toHaveBeenCalled())
    act(() => worker().reply({ type: 'state', state: withCount(63) }))
    await act(async () => answer(snapshotAt(Date.now(), ZONE, withCount(61))))
    expect(result.current.state.totalActivities).toBe(63)
    expect(await readSnapshot('u1')).toBeNull()
  })

  it('is not shown over work this device has not sent', async () => {
    get.mockResolvedValue(snapshotAt(Date.now(), ZONE, withCount(61)))
    waiting.mockResolvedValue(3)
    const outboxRun = setup(SIGNED_IN)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(outboxRun.result.current.state.result).toBeNull()
    expect(get).not.toHaveBeenCalled()
    outboxRun.unmount()

    waiting.mockResolvedValue(0)
    noteChoice()
    const settingsRun = setup(SIGNED_IN)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(settingsRun.result.current.state.result).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('server results off for the account', () => {
  it.each([
    ['answers 404', () => get.mockResolvedValue(null)],
    ['cannot be reached', () => get.mockRejectedValue(new Error('offline'))],
    [
      'sends a snapshot of another model',
      () => {
        const snapshot = snapshotAt(Date.now(), ZONE, withCount(61))
        get.mockResolvedValue({ ...snapshot, modelRevision: MODEL_REVISION + 1 })
      },
    ],
  ])(
    'behaves as without: the device copy, then the live analysis (state %s)',
    async (_name, arrange) => {
      arrange()
      await writeSnapshot('u1', snapshotAt(Date.now(), ZONE, withCount(22)))
      const { result } = setup(SIGNED_IN)
      await waitFor(() => expect(result.current.state.totalActivities).toBe(22))
      await waitFor(() => expect(get).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(result.current.state.totalActivities).toBe(22)
      expect(worker().posted.map((request) => request.type)).toContain('loadServer')
      act(() => worker().reply({ type: 'state', state: withCount(23) }))
      expect(result.current.state.totalActivities).toBe(23)
    },
  )

  it('shows an account with no copy the restoring state, as before', async () => {
    get.mockResolvedValue(null)
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(get).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(result.current.state.result).toBeNull()
    expect(await readSnapshot('u1')).toBeNull()
  })

  it('never asks the server for an account /api/me does not mark, though it has a device copy', async () => {
    await writeSnapshot('u1', snapshotAt(Date.now(), ZONE, withCount(22)))
    const { serverState: _on, ...off } = ME
    const { result } = setup({ status: 'signed-in', me: off })
    await waitFor(() => expect(result.current.state.totalActivities).toBe(22))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(get).not.toHaveBeenCalled()
  })

  it('never asks the server while signed out', async () => {
    await writeSnapshot('device', snapshotAt(Date.now(), ZONE, withCount(41)))
    const { result } = setup(SIGNED_OUT)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(41))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(get).not.toHaveBeenCalled()
  })
})

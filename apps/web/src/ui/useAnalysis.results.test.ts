// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { snapshotContentHash } from '@rca/core/stateSnapshot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateRead } from '../api/state'
import * as api from '../api/state'
import { FakeWorker } from '../test/fakeWorker'
import { resultState, snapshotAt } from '../test/stateCopyKit'
import { makeResult } from './components/test/fixtures'
import { readSnapshot, writeSnapshot } from '../worker/stateStore'
import { setKeptLibraryHinted } from './analysis/keptLibrary'
import { BUSY_RETRY_MS, POLL_MS } from './analysis/accountResults'
import * as staleBuild from './analysis/staleBuild'
import { tellOtherTabs } from './tabSync'
import { useAnalysis } from './useAnalysis'
import type { AccountStatus } from './useAccount'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)
vi.mock('../api/state', () => ({ readServerState: vi.fn() }))
vi.mock('./analysis/staleBuild', () => ({ reloadOnceForNewBuild: vi.fn() }))

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const meOf = (id: string): Me => ({
  user: { id, email: `${id}@example.com`, name: 'Ada', pictureUrl: null },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: false,
    birthYear: null,
    sex: null,
    updatedAt: 1000,
  },
})
interface Account {
  status: AccountStatus
  me: Me | null
  sessionExpired?: boolean
}
const SIGNED_IN: Account = { status: 'signed-in', me: meOf('u1') }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const DAY_MS = 86_400_000
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const read = vi.mocked(api.readServerState)
const worker = (): FakeWorker => FakeWorker.instances.at(-1)!
const withCount = (totalActivities: number): SessionState => ({ ...resultState(), totalActivities })
const snapshot = (count: number, nowMs = Date.now(), zone = ZONE) =>
  snapshotAt(nowMs, zone, withCount(count))
const served = (
  count: number,
  extra: Partial<StateRead & { kind: 'snapshot' }> = {},
): StateRead => ({
  kind: 'snapshot',
  snapshot: snapshot(count),
  nowMs: null,
  current: true,
  ...extra,
})

function setup(account: Account) {
  return renderHook(({ account }: { account: Account }) => useAnalysis(SETTINGS, account), {
    initialProps: { account },
  })
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('indexedDB', new IDBFactory())
  read.mockReset()
  vi.mocked(staleBuild.reloadOnceForNewBuild).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setKeptLibraryHinted(false)
})

describe('a signed-in account’s results are the server’s', () => {
  it('shows the server’s snapshot for a device with no copy, and keeps it as the device copy', async () => {
    const now = Date.now()
    read.mockResolvedValue(served(61, { snapshot: snapshot(61, now) }))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    expect(result.current.copyStale).toBeUndefined()
    await waitFor(async () => expect((await readSnapshot('u1'))?.nowMs).toBe(now))
    expect(worker().posted.map((request) => request.type)).toContain('loadServer')
  })

  it('paints the copy at once, asks with its tag, and replaces it when the server answers with another', async () => {
    const copy = snapshot(22)
    await writeSnapshot('u1', copy)
    let answer: (read: StateRead) => void = () => undefined
    read.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(22))
    await waitFor(() => expect(read).toHaveBeenCalled())
    expect(read.mock.calls[0]![0]).toBe('u1')
    expect(await snapshotContentHash(read.mock.calls[0]![1]!)).toBe(await snapshotContentHash(copy))
    await act(async () => answer(served(61)))
    expect(result.current.state.totalActivities).toBe(61)
  })

  it('never shows or writes a state the browser computed for the account', async () => {
    read.mockResolvedValue(served(61))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    act(() => worker().reply({ type: 'state', state: withCount(99) }))
    // Longer than the wait before the signed-out path keeps a live state.
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)))
    vi.useRealTimers()
    expect(result.current.state.totalActivities).toBe(61)
    expect(JSON.stringify((await readSnapshot('u1'))?.state)).not.toContain('"totalActivities":99')
  })

  it('writes the server’s X-State-Now into the stored copy on a 304, and it is not stale after a reload', async () => {
    const old = snapshot(22, Date.now() - 2 * DAY_MS)
    await writeSnapshot('u1', old)
    read.mockResolvedValue({ kind: 'unchanged', nowMs: Date.now(), current: true })
    const first = setup(SIGNED_IN)
    await waitFor(async () => expect((await readSnapshot('u1'))?.nowMs).toBeGreaterThan(old.nowMs))
    await waitFor(() => expect(first.result.current.copyStale).toBeUndefined())
    first.unmount()
    // A reload: the copy is read again, and the server is not heard from before it is painted.
    read.mockImplementation(() => new Promise(() => undefined))
    const second = setup(SIGNED_IN)
    await waitFor(() => expect(second.result.current.state.totalActivities).toBe(22))
    expect(second.result.current.copyStale).toBeUndefined()
  })

  it('keeps the copy on a 202 and asks again after Retry-After', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    await writeSnapshot('u1', snapshot(22))
    read.mockResolvedValueOnce({ kind: 'computing', retryAfterMs: 2_000 })
    read.mockResolvedValue(served(61))
    const { result } = setup(SIGNED_IN)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    expect(result.current.state.totalActivities).toBe(22)
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)))
    await vi.waitFor(() => expect(result.current.state.totalActivities).toBe(61))
  })

  it('shows nothing for an account with no copy while the server computes, then the results', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    read.mockResolvedValueOnce({ kind: 'computing', retryAfterMs: 2_000 })
    read.mockResolvedValue(served(61))
    const { result } = setup(SIGNED_IN)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    expect(result.current.state.result).toBeNull()
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)))
    await vi.waitFor(() => expect(result.current.state.totalActivities).toBe(61))
  })

  it('shows what the server served while it computes, and asks again in a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    read.mockResolvedValueOnce(served(22, { current: false }))
    read.mockResolvedValue(served(61))
    const { result } = setup(SIGNED_IN)
    await vi.waitFor(() => expect(result.current.state.totalActivities).toBe(22))
    await act(async () => void (await vi.advanceTimersByTimeAsync(BUSY_RETRY_MS)))
    await vi.waitFor(() => expect(result.current.state.totalActivities).toBe(61))
  })

  it('keeps the copy and reloads the tab once for a snapshot of another build, once the library has loaded', async () => {
    await writeSnapshot('u1', snapshot(22))
    const other = { ...snapshot(61), modelRevision: MODEL_REVISION + 1 }
    read.mockResolvedValue({ kind: 'snapshot', snapshot: other, nowMs: null, current: true })
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(read).toHaveBeenCalled())
    // The tab is still loading its library: a reload would cut across that.
    expect(staleBuild.reloadOnceForNewBuild).not.toHaveBeenCalled()
    act(() => worker().reply({ type: 'state', state: null }))
    await waitFor(() => expect(staleBuild.reloadOnceForNewBuild).toHaveBeenCalled())
    expect(result.current.state.totalActivities).toBe(22)
  })

  it('asks again on coming back into view, every minute, and for a change this tab or another made', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    read.mockResolvedValue(served(61))
    setup(SIGNED_IN)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS)))
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    act(() => tellOtherTabs({ type: 'settings' }))
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4))
  })

  it('lays the import’s facts and the index’s counts over the server’s state, and asks the server again after a reply with no state', async () => {
    read.mockResolvedValue(served(61))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    const asked = read.mock.calls.length
    act(() =>
      worker().reply({
        type: 'state',
        state: null,
        facts: {
          rejected: [],
          unsupportedFiles: 2,
          syncIssues: [{ code: 'network', count: 1 }],
        },
        index: {
          outdatedActivities: 4,
          incompatibleActivities: 1,
          libraryActivities: 70,
          heldOut: [],
        },
      }),
    )
    expect(result.current.state).toMatchObject({
      totalActivities: 61,
      unsupportedFiles: 2,
      syncIssues: [{ code: 'network', count: 1 }],
      outdatedActivities: 4,
      incompatibleActivities: 1,
      libraryActivities: 70,
    })
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(asked))
  })

  it('drops an answer that comes after the account changed', async () => {
    let answer: (read: StateRead) => void = () => undefined
    read.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    read.mockResolvedValue(served(7))
    const view = setup(SIGNED_IN)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    view.rerender({ account: { status: 'signed-in', me: meOf('u2') } })
    await waitFor(() => expect(view.result.current.state.totalActivities).toBe(7))
    await act(async () => answer(served(61)))
    expect(view.result.current.state.totalActivities).toBe(7)
    expect(await readSnapshot('u1')).toBeNull()
  })

  it('keeps the results on screen when the session expires, and asks for nothing more', async () => {
    read.mockResolvedValue(served(61))
    const view = setup(SIGNED_IN)
    await waitFor(() => expect(view.result.current.state.totalActivities).toBe(61))
    const asked = read.mock.calls.length
    view.rerender({ account: { ...SIGNED_OUT, sessionExpired: true } })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(view.result.current.state.totalActivities).toBe(61)
    expect(read.mock.calls.length).toBe(asked)
  })

  it('shows a state of the device’s own once one arrives after the session expired', async () => {
    read.mockResolvedValue(served(61))
    const view = setup(SIGNED_IN)
    await waitFor(() => expect(view.result.current.state.totalActivities).toBe(61))
    view.rerender({ account: { ...SIGNED_OUT, sessionExpired: true } })
    expect(view.result.current.state.totalActivities).toBe(61)
    // A file dropped after the expiry is analysed on the device, and what it shows is that analysis.
    act(() => view.result.current.addFiles([new File([new Uint8Array(4)], 'a.fit')]))
    act(() => worker().reply({ type: 'state', state: withCount(5) }))
    expect(view.result.current.state.totalActivities).toBe(5)
  })

  it('drops what the last account’s replies said of its import and index when the account changes', async () => {
    read.mockResolvedValue(served(61))
    const view = setup(SIGNED_IN)
    await waitFor(() => expect(view.result.current.state.totalActivities).toBe(61))
    act(() =>
      worker().reply({
        type: 'state',
        state: null,
        facts: { rejected: [], unsupportedFiles: 2, syncIssues: [] },
      }),
    )
    expect(view.result.current.state.unsupportedFiles).toBe(2)
    view.rerender({ account: { status: 'signed-in', me: meOf('u2') } })
    await waitFor(() => expect(view.result.current.state.unsupportedFiles).toBe(0))
  })

  it('hands the check-in its snapshot carries to the worker once the library has loaded, and shows the view it answers', async () => {
    const live = { v: 1, revision: 1, atMs: 5, asOfMs: 5, keys: {}, counts: {}, bests: {} }
    const withCheckIn = (nowMs: number) => ({
      ...snapshot(61, nowMs),
      checkIn: live,
    })
    read.mockResolvedValue({
      kind: 'snapshot',
      snapshot: withCheckIn(Date.now()),
      nowMs: null,
      current: true,
    })
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    // Not before the worker knows the account: the library is still loading.
    expect(worker().posted.some((request) => request.type === 'checkInFor')).toBe(false)
    act(() => worker().reply({ type: 'state', state: null }))
    await waitFor(() => expect(worker().posted).toContainEqual({ type: 'checkInFor', live }))
    act(() => worker().reply({ type: 'checkInView', view: { checkIn: null, seen: true } }))
    expect(result.current.checkIn).toMatchObject({ seen: true })
    // The same check-in in a newer snapshot is not handed over again.
    const asked = worker().posted.filter((request) => request.type === 'checkInFor').length
    read.mockResolvedValue({
      kind: 'snapshot',
      snapshot: withCheckIn(Date.now() + 1_000),
      nowMs: null,
      current: true,
    })
    act(() => tellOtherTabs({ type: 'settings' }))
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(worker().posted.filter((request) => request.type === 'checkInFor')).toHaveLength(asked)
  })

  describe('what an import moved', () => {
    const R61 = makeResult({})
    const R62 = { ...R61, marker: 'after the import' } as unknown as typeof R61
    const at = (result: typeof R61, count: number, version: number, current = true): StateRead => ({
      kind: 'snapshot',
      snapshot: {
        ...snapshotAt(Date.now(), ZONE, { ...resultState(), totalActivities: count, result }),
        libraryVersion: version,
      },
      nowMs: null,
      current,
    })
    const outcome = { activities: 2, filesAdded: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }

    /** Signed in on the 61-activity results (version 5), an import of two files sent and its reply in: it ended at version 7. */
    async function importEnded() {
      read.mockResolvedValue(at(R61, 61, 5))
      const view = setup(SIGNED_IN)
      await waitFor(() => expect(view.result.current.state.totalActivities).toBe(61))
      act(() => worker().reply({ type: 'state', state: null }))
      act(() => view.result.current.addFiles([new File([new Uint8Array(4)], 'a.fit')]))
      await waitFor(() => expect(worker().posted.at(-1)?.type).toBe('addFiles'))
      act(() =>
        worker().reply({ type: 'state', state: null, outcome, saved: 2, libraryVersion: 7 }),
      )
      await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1))
      expect(view.result.current.importOutcome).toEqual(outcome)
      expect(view.result.current.importChange).toBeNull()
      return view
    }
    const ask = async (next: StateRead) => {
      read.mockResolvedValue(next)
      const asked = read.mock.calls.length
      act(() => tellOtherTabs({ type: 'settings' }))
      await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(asked))
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    it('lands only on current results of the version the import ended at, and tells the 61-activity results from the 62', async () => {
      const view = await importEnded()
      // The server served what it had stored while it computed: that is not the results that include the import.
      await ask(at(R62, 62, 7, false))
      expect(view.result.current.importChange).toBeNull()
      // A compute made mid-way, with some of the files: current, but short of the version the import ended at.
      await ask(at(R62, 62, 6))
      expect(view.result.current.importChange).toBeNull()
      await ask(at(R62, 62, 7))
      await waitFor(() => expect(view.result.current.importChange).not.toBeNull())
      expect(view.result.current.importChange).toMatchObject({ outcome })
      expect(view.result.current.importChange?.before).toEqual(R61)
      expect(view.result.current.importChange?.after).toEqual(R62)
    })

    it('ends the wait when the account changes: another account’s results never land it', async () => {
      const view = await importEnded()
      view.rerender({ account: { status: 'signed-in', me: meOf('u2') } })
      await ask(at(R62, 62, 7))
      expect(view.result.current.importChange).toBeNull()
    })

    it('ends the wait when the summary is dismissed', async () => {
      const view = await importEnded()
      act(() => view.result.current.dismissSummary())
      await ask(at(R62, 62, 7))
      expect(view.result.current.importChange).toBeNull()
    })

    it('waits for the row that goes with the results, so its bests are of the same baseline', async () => {
      const view = await importEnded()
      const withRow = (read: StateRead): StateRead =>
        read.kind === 'snapshot'
          ? {
              ...read,
              snapshot: {
                ...read.snapshot,
                checkIn: { v: 1, revision: 1, atMs: 1, asOfMs: 1, keys: {}, counts: {}, bests: {} },
              },
            }
          : read
      await ask(withRow(at(R62, 62, 7)))
      // The library is loaded and the row is asked for; until it is answered the summary does not land.
      await waitFor(() =>
        expect(worker().posted.some((request) => request.type === 'checkInFor')).toBe(true),
      )
      expect(view.result.current.importChange).toBeNull()
      const bests = [{ effort: 'e', unit: 'u', value: 1, atMs: 1, key: 'k' }]
      act(() =>
        worker().reply({ type: 'checkInView', view: { checkIn: { bests } as never, seen: false } }),
      )
      await waitFor(() => expect(view.result.current.importChange).not.toBeNull())
      expect(view.result.current.importChange?.bests).toEqual(bests)
    })
  })

  it('tells at once that an import that added nothing moved nothing', async () => {
    read.mockResolvedValue(served(61))
    const { result } = setup(SIGNED_IN)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(61))
    act(() => worker().reply({ type: 'state', state: null }))
    act(() => result.current.addFiles([new File([new Uint8Array(4)], 'a.fit')]))
    await waitFor(() => expect(worker().posted.at(-1)?.type).toBe('addFiles'))
    const outcome = { activities: 1, filesAdded: 0, rejected: 0, duplicates: [], runs: 0, rides: 0 }
    act(() => worker().reply({ type: 'state', state: null, outcome }))
    await waitFor(() => expect(result.current.importChange).not.toBeNull())
  })

  it('shows no account results after a sign-out', async () => {
    read.mockResolvedValue(served(61))
    const view = setup(SIGNED_IN)
    await waitFor(() => expect(view.result.current.state.totalActivities).toBe(61))
    view.rerender({ account: SIGNED_OUT })
    await waitFor(() => expect(view.result.current.state.totalActivities).not.toBe(61))
  })
})

describe('signed out', () => {
  it('never asks the server, and paints the device copy', async () => {
    await writeSnapshot('device', snapshot(41))
    const { result } = setup(SIGNED_OUT)
    await waitFor(() => expect(result.current.state.totalActivities).toBe(41))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(read).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'
import { setKeptLibraryHinted } from './analysis/keptLibrary'
import { EMPTY_PERIOD } from './analysis/model'
import type { AccountStatus } from './useAccount'
import { DEVICE_GRACE_MS, useAnalysis } from './useAnalysis'

/** A Worker that records what the hook posts and lets the test send replies. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted: WorkerRequest[] = []
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(request: WorkerRequest) {
    this.posted.push(request)
  }
  terminate() {}
  reply(data: WorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<WorkerResponse>)
  }
}

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
  lookupPending?: boolean
}
const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN: Account = { status: 'signed-in', me: ME }
/** The API could not be reached, but the lookup will be tried again. */
const UNREACHABLE: Account = { status: 'unavailable', me: null, lookupPending: true }
const FILE = new File(['x'], 'run.fit')

function stateWith(totalActivities: number): SessionState {
  return {
    result: null,
    rejected: [],
    unsupportedFiles: 0,
    isSample: false,
    totalActivities,
    period: EMPTY_PERIOD,
    library: [],
    syncIssues: [],
    outdatedActivities: 0,
    incompatibleActivities: 0,
    hiddenDuplicates: 0,
    walkingPaceRuns: 0,
    trend: [],
    previous: null,
    effortTrends: NO_TRENDS,
    sameHeartRate: NO_SAME_HEART_RATE,
    lateEvidence: NO_LATE_EVIDENCE,
    heartRateJudgement: NO_HEART_RATE_JUDGEMENT,
    fitness: NO_FITNESS,
    zoneEstimates: null,
    timeInZones: NO_ZONE_TIMES,
    records: new Map(),
  }
}

function worker(): FakeWorker {
  const found = FakeWorker.instances.at(-1)
  if (found === undefined) throw new Error('no worker was created')
  return found
}

const types = () => worker().posted.map((request) => request.type)

function setup() {
  return renderHook(({ account }: { account: Account }) => useAnalysis(SETTINGS, account, false), {
    initialProps: { account: LOADING },
  })
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setKeptLibraryHinted(false)
})

describe('a returning visitor while the account lookup is out', () => {
  it('loads the kept library after the grace, without waiting for the account', () => {
    setKeptLibraryHinted(true)
    setup()
    expect(types()).toEqual([])
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS - 1))
    expect(types()).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(types()).toEqual(['loadDevice'])
    // Not repeated however long the account takes.
    act(() => vi.advanceTimersByTime(60_000))
    expect(types()).toEqual(['loadDevice'])
  })

  it('shows the kept results when the library replies, and stays in the restoring state until then', () => {
    setKeptLibraryHinted(true)
    const { result } = setup()
    expect(result.current.restoring).toBe(true)
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS))
    act(() => worker().reply({ type: 'state', state: stateWith(7) }))
    expect(result.current.restoring).toBe(false)
    expect(result.current.state.totalActivities).toBe(7)
  })

  it('waits for the account when nothing was kept, since there is nothing to show', () => {
    setup()
    act(() => vi.advanceTimersByTime(60_000))
    expect(types()).toEqual([])
  })

  it('never loads the kept library for an account that answers within the grace', () => {
    setKeptLibraryHinted(true)
    const { rerender } = setup()
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS - 1))
    rerender({ account: SIGNED_IN })
    act(() => vi.advanceTimersByTime(60_000))
    expect(types()).toEqual(['loadServer'])
  })

  it('loads it at once when the account answers signed out within the grace', () => {
    setKeptLibraryHinted(true)
    const { rerender } = setup()
    rerender({ account: SIGNED_OUT })
    expect(types()).toEqual(['loadDevice'])
    act(() => vi.advanceTimersByTime(60_000))
    expect(types()).toEqual(['loadDevice'])
  })

  describe('the account turns out to be signed in, in either order', () => {
    const SERVER = stateWith(11)
    const DEVICE = stateWith(7)

    /** Answers every request the worker owes, in order, with the state its kind would produce. */
    function settleAll() {
      const owed = worker().posted.map((request) => request.type)
      for (const type of owed) {
        const state = type === 'loadServer' ? SERVER : type === 'loadDevice' ? DEVICE : stateWith(0)
        act(() => worker().reply({ type: 'state', state }))
      }
    }

    it('answered after the kept library showed: the page ends on the account library only', () => {
      setKeptLibraryHinted(true)
      const { result, rerender } = setup()
      act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS))
      act(() => worker().reply({ type: 'state', state: DEVICE }))
      expect(result.current.state.totalActivities).toBe(7)
      rerender({ account: SIGNED_IN })
      // The kept results leave the page, then the account's library loads.
      expect(types()).toEqual(['loadDevice', 'clear', 'loadServer'])
      act(() => worker().reply({ type: 'state', state: stateWith(0) }))
      act(() => worker().reply({ type: 'state', state: SERVER }))
      expect(result.current.state.totalActivities).toBe(11)
      expect(result.current.libraryStatus).toBe('loaded')
    })

    it('answered before the kept library replied: its late reply is dropped, same final page', () => {
      setKeptLibraryHinted(true)
      const { result, rerender } = setup()
      act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS))
      rerender({ account: SIGNED_IN })
      expect(types()).toEqual(['loadDevice', 'clear', 'loadServer'])
      settleAll()
      expect(result.current.state.totalActivities).toBe(11)
      expect(result.current.libraryStatus).toBe('loaded')
    })
  })

  it('applies the grace to an API that fails at once, instead of loading the kept library on the spot', () => {
    setKeptLibraryHinted(true)
    const { rerender } = setup()
    act(() => vi.advanceTimersByTime(50))
    rerender({ account: UNREACHABLE })
    expect(types()).toEqual([])
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS - 51))
    expect(types()).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(types()).toEqual(['loadDevice'])
  })

  it('loads the kept library at once for an unreachable API when nothing was kept', () => {
    const { rerender } = setup()
    rerender({ account: UNREACHABLE })
    expect(types()).toEqual(['loadDevice'])
  })

  describe('files added while the kept library waits for the grace', () => {
    /** A hinted visit with files added 100 ms in; the grace then passes and the library read is sent. */
    function addedDuringGrace() {
      setKeptLibraryHinted(true)
      const hook = setup()
      act(() => vi.advanceTimersByTime(100))
      act(() => hook.result.current.addFiles([FILE]))
      act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS - 100))
      return hook
    }

    it('are held for the library and added again once it has loaded, not lost to it', () => {
      const { result, rerender } = addedDuringGrace()
      expect(types()).toEqual(['addFiles', 'loadDevice'])
      expect(result.current.waitingReason).not.toBeNull()
      // The analysis of the files answers first, then the library read; the read releases the files.
      act(() => worker().reply({ type: 'state', state: stateWith(0) }))
      act(() => worker().reply({ type: 'state', state: stateWith(7) }))
      expect(types()).toEqual(['addFiles', 'loadDevice', 'addFiles'])
      // The account turns out to be nobody's: what was analysed on top of the library is kept.
      act(() => worker().reply({ type: 'state', state: stateWith(8) }))
      rerender({ account: SIGNED_OUT })
      expect(types().at(-1)).toBe('keepProvisional')
      expect(types().filter((type) => type === 'addFiles')).toHaveLength(2)
    })

    it('are saved to the account when it turns out to be signed in', async () => {
      const { rerender } = addedDuringGrace()
      rerender({ account: SIGNED_IN })
      expect(types()).toEqual(['addFiles', 'loadDevice', 'clear', 'loadServer'])
      // Replies in the order the worker owes them.
      for (const state of [stateWith(0), stateWith(7), stateWith(0), stateWith(11)])
        act(() => worker().reply({ type: 'state', state }))
      await act(async () => undefined)
      const adds = worker().posted.filter((request) => request.type === 'addFiles')
      expect(adds).toHaveLength(2)
      expect(adds.at(-1)).toMatchObject({ files: [FILE], sync: { userId: 'u1' } })
    })
  })

  it('sends nothing, and keeps no timer, once the page is gone', () => {
    setKeptLibraryHinted(true)
    const { unmount } = setup()
    const before = worker()
    act(() => vi.advanceTimersByTime(100))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(60_000))
    expect(before.posted).toEqual([])
  })

  it('sends one library read, from the new worker, when the worker restarts during the grace', () => {
    setKeptLibraryHinted(true)
    setup()
    const crashed = worker()
    act(() => vi.advanceTimersByTime(100))
    act(() => crashed.onerror?.(new ErrorEvent('error', { message: 'boom' })))
    const restarted = worker()
    expect(restarted).not.toBe(crashed)
    act(() => vi.advanceTimersByTime(DEVICE_GRACE_MS - 101))
    expect(restarted.posted).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(restarted.posted.map((request) => request.type)).toEqual(['loadDevice'])
    expect(crashed.posted).toEqual([])
  })
})

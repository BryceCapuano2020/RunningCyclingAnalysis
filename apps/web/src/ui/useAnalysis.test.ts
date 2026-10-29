// @vitest-environment jsdom
import type { Copy } from '@rca/core/session'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import { createElement, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { DAILY_LIMITS } from '@rca/contract'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { RouteReply } from './routeReply'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'
import type { AccountStatus } from './useAccount'
import { useAnalysis } from './useAnalysis'
import { SyncStatus } from './components/SyncStatus'
import { formatDay } from './format/date'
import { makeActivity, makeResult } from './components/fixtures'
import { EMPTY_PERIOD } from './analysis/model'
import { PERIOD_KEY } from './periodPreference'

const SAVED_COPY: Copy = {
  id: 'saved-copy',
  rank: 3,
  hasPower: false,
  hasHeartRate: true,
  durationS: 3600,
}

/** The local time shown for a reset instant, as the limit copy formats it. */
function localTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms)
}

/** The reset sentence, with the local time left to the viewer's zone. */
const RESET_AT_UTC_MIDNIGHT = /It resets at .+, your time\.$/

/** A Worker that records what the hook posts and lets the test send replies. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted: WorkerRequest[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(request: WorkerRequest) {
    this.posted.push(request)
  }

  terminate() {
    this.terminated = true
  }

  reply(data: WorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<WorkerResponse>)
  }
}

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const USER_ID = 'u1'
/** The request a worker gets when it starts without a signed-in account. */
const DEVICE_LOAD: WorkerRequest = { type: 'loadDevice', settings: SETTINGS }

function meWith(keepFiles: boolean, fileRetentionAvailable?: boolean): Me {
  const me: Me = {
    user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
    profile: {
      massKg: 75,
      bikeMassKg: 9,
      units: 'metric',
      keepFiles,
      birthYear: null,
      sex: null,
      updatedAt: 1000,
    },
  }
  return fileRetentionAvailable === undefined ? me : { ...me, fileRetentionAvailable }
}

function meAs(id: string): Me {
  const me = meWith(true)
  return { ...me, user: { ...me.user, id } }
}

interface Account {
  status: AccountStatus
  me: Me | null
  flushProfileWrites?: () => Promise<Me | null>
  markExpired?: () => void
  refresh?: () => Promise<Me | null>
  sessionExpired?: boolean
  lookupPending?: boolean
}

const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN_KEEP: Account = { status: 'signed-in', me: meWith(true) }
const SIGNED_IN_NO_KEEP: Account = { status: 'signed-in', me: meWith(false) }
const UNAVAILABLE: Account = { status: 'unavailable', me: null }
/** The API could not be reached, but the lookup will be tried again, so who is signed in is unknown. */
const UNREACHABLE: Account = { status: 'unavailable', me: null, lookupPending: true }

function setup(initial: Account = LOADING, settings: AthleteSettings = SETTINGS) {
  return renderHook(
    ({ account, current }: { account: Account; current: AthleteSettings }) =>
      useAnalysis(current, account, false),
    { initialProps: { account: initial, current: settings } },
  )
}

/** Replies to the account's library load, so imports are sent to the library. */
function finishLibraryLoad(state: SessionState = STATE) {
  act(() => worker().reply({ type: 'state', state }))
}

/** Replies to the device-library load that a worker starts with when nobody is signed in. */
function finishDeviceLoad(state: SessionState = STATE) {
  act(() => worker().reply({ type: 'state', state }))
}

/** The activities the worker reports as stored in this browser, which the kept-library hint follows. */
function reportKept(count: number) {
  const activities = Array.from({ length: count }, (_, index) => ({
    id: `run-${index}`,
    name: `Run ${index}`,
    startMs: Date.UTC(2026, 9, 20 + index),
    sport: 'run' as const,
    copy: SAVED_COPY,
  }))
  act(() => worker().reply({ type: 'libraryActivities', activities }))
}

function StrictWrapper({ children }: { children: ReactNode }) {
  return createElement(StrictMode, null, children)
}

function worker(): FakeWorker {
  const found = FakeWorker.instances.at(-1)
  if (found === undefined) throw new Error('no worker was created')
  return found
}

const FILE = new File(['x'], 'run.fit')

const STATE = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
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
  zoneEstimates: null,
  timeInZones: NO_ZONE_TIMES,
  records: new Map(),
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAnalysis account handling', () => {
  it('loads the stored activities once when signing in', () => {
    const { rerender } = setup(LOADING)
    expect(worker().posted).toEqual([])

    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    rerender({ account: { ...SIGNED_IN_KEEP }, current: SETTINGS })

    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('loads the stored activities when signing in after the first lookup found nobody', () => {
    const { rerender } = setup(SIGNED_OUT)
    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('loads the stored activities when the page opens already signed in', () => {
    setup(SIGNED_IN_KEEP)
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('loads the stored activities on the period picked on this device', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(42))
    try {
      setup(SIGNED_IN_KEEP)
      expect(worker().posted).toEqual([
        { type: 'loadServer', settings: SETTINGS, userId: USER_ID, choice: 42 },
      ])
    } finally {
      localStorage.removeItem(PERIOD_KEY)
    }
  })

  it('names no period when the athlete has picked none, or has picked the default', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify('default'))
    try {
      setup(SIGNED_IN_KEEP)
      expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
      expect(worker().posted[0]).not.toHaveProperty('choice')
    } finally {
      localStorage.removeItem(PERIOD_KEY)
    }
  })

  it('loads the stored activities into the active worker under StrictMode', () => {
    renderHook(
      ({ account, current }: { account: Account; current: AthleteSettings }) =>
        useAnalysis(current, account, false),
      {
        initialProps: { account: SIGNED_IN_KEEP, current: SETTINGS },
        wrapper: StrictWrapper,
        reactStrictMode: true,
      },
    )
    expect(FakeWorker.instances).toHaveLength(2)
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('clears the library when the user signs out', () => {
    const { rerender, result } = setup(SIGNED_IN_KEEP)
    const oldWorker = worker()
    act(() => oldWorker.reply({ type: 'state', state: { ...STATE, totalActivities: 4 } }))
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(result.current.state).toEqual(STATE)
    expect(oldWorker.terminated).toBe(true)
    expect(worker()).not.toBe(oldWorker)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('keeps a slow prior-account reply from restoring the library after sign-out', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    const oldWorker = worker()
    act(() => oldWorker.reply({ type: 'state', state: { ...STATE, totalActivities: 4 } }))
    expect(result.current.state.totalActivities).toBe(4)

    act(() => result.current.addFiles([FILE]))
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(result.current.state).toEqual(STATE)

    act(() => oldWorker.reply({ type: 'state', state: { ...STATE, totalActivities: 5 } }))
    expect(result.current.state).toEqual(STATE)
    expect(worker()).not.toBe(oldWorker)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('terminates account A work before loading account B and ignores late A replies', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    const workerA = worker()
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    expect(workerA.posted.at(-1)).toMatchObject({
      type: 'addFiles',
      sync: { userId: 'u1' },
    })

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(workerA.terminated).toBe(true)
    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    const workerB = worker()
    expect(workerB.posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: 'u2' }])

    act(() => workerA.reply({ type: 'state', state: { ...STATE, totalActivities: 99 } }))
    expect(result.current.state).toEqual(STATE)
    expect(workerB.posted).not.toContainEqual(expect.objectContaining({ type: 'addFiles' }))
  })

  it('says an import was cancelled when the account changes while the worker is saving it', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    expect(worker().posted.at(-1)).toMatchObject({ type: 'addFiles', sync: { userId: 'u1' } })

    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    expect(result.current.error).toBe(
      'An import was cancelled because the account changed. Select the files again.',
    )
  })

  it('says nothing of a cancelled import when the account changes with none running', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE }))

    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    expect(result.current.error).toBeNull()
  })

  it('hydrates account B after a direct signed-in A to B switch', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    const workerA = worker()
    act(() => result.current.addFiles([FILE]))

    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    const workerB = worker()

    expect(workerA.terminated).toBe(true)
    expect(workerB).not.toBe(workerA)
    expect(workerB.posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: 'u2' }])
  })

  it('does not surface a worker failure from an import abandoned by sign-out', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    const oldWorker = worker()
    act(() => worker().reply({ type: 'state', state: STATE }))
    act(() => result.current.addFiles([FILE]))
    rerender({ account: SIGNED_OUT, current: SETTINGS })

    act(() => oldWorker.onerror?.({ message: 'prior account upload failed' } as ErrorEvent))

    expect(result.current.state).toEqual(STATE)
    // The import is said to be cancelled, and the old worker's failure is not heard.
    expect(result.current.error).toBe(
      'An import was cancelled because the account changed. Select the files again.',
    )
  })

  it('does not clear the library when the first account lookup finds nobody signed in', () => {
    const { rerender } = setup(LOADING)
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('does not restart the worker or send anything when sign-in turns unavailable after the kept library loaded', () => {
    const { rerender } = setup(UNAVAILABLE)
    const kept = worker()
    const posted = [...kept.posted]

    // The background retries find nobody signed in, or fail again: nothing changes for the visitor.
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    rerender({ account: UNAVAILABLE, current: SETTINGS })

    expect(worker()).toBe(kept)
    expect(kept.terminated).toBe(false)
    expect(kept.posted).toEqual(posted)
  })

  it('lists the account’s activities when a Start over overtakes the library load', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    const saved = {
      id: 'run-1',
      name: 'Run',
      startMs: Date.UTC(2026, 9, 20),
      sport: 'run' as const,
      copy: SAVED_COPY,
    }

    act(() => result.current.clear())
    // The load's own list and state arrive after the clear: the account's library still counts.
    act(() => worker().reply({ type: 'libraryActivities', activities: [saved] }))
    act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 1 } }))

    expect(result.current.savedActivities).toEqual([saved])
  })

  it('does not clear the library when the account becomes unavailable', () => {
    const { rerender, result } = setup(SIGNED_IN_KEEP)
    act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 2 } }))
    const oldWorker = worker()
    rerender({ account: { status: 'unavailable', me: null }, current: SETTINGS })
    expect(result.current.state).toEqual(STATE)
    expect(oldWorker.terminated).toBe(true)
    expect(worker()).not.toBe(oldWorker)
  })

  it('sends the keep-files setting with each import while signed in', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    rerender({ account: { status: 'signed-in', me: meWith(false) }, current: SETTINGS })
    act(() => result.current.addFiles([FILE]))

    expect(worker().posted).toEqual([
      { type: 'loadServer', settings: SETTINGS, userId: USER_ID },
      {
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: { keepFiles: true, userId: USER_ID },
      },
      {
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: { keepFiles: false, userId: USER_ID },
      },
    ])
  })

  it('waits for submitted profile writes before choosing the import retention setting', async () => {
    let finish!: (me: Me | null) => void
    const account: Account = {
      ...SIGNED_IN_NO_KEEP,
      flushProfileWrites: () => new Promise((resolve) => (finish = resolve)),
    }
    const { result } = setup(account)
    act(() => worker().reply({ type: 'state', state: STATE }))

    act(() => result.current.addFiles([FILE]))
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
    expect(result.current.busy).toBe(true)

    await act(async () => {
      const saved = meWith(true)
      finish({ ...saved, profile: { ...saved.profile, massKg: 83, bikeMassKg: 12 } })
      await Promise.resolve()
    })

    expect(worker().posted.at(-1)).toEqual({
      type: 'addFiles',
      files: [FILE],
      settings: { massKg: 83, bikeMassKg: 12 },
      sync: { keepFiles: true, userId: USER_ID },
    })
  })

  it('imports a signed-in profile with no body mass on the analysis placeholder, not on null', async () => {
    let finish!: (me: Me | null) => void
    const account: Account = {
      ...SIGNED_IN_NO_KEEP,
      flushProfileWrites: () => new Promise((resolve) => (finish = resolve)),
    }
    const { result } = setup(account)
    act(() => worker().reply({ type: 'state', state: STATE }))

    act(() => result.current.addFiles([FILE]))
    await act(async () => {
      const saved = meWith(true)
      finish({ ...saved, profile: { ...saved.profile, massKg: null, bikeMassKg: 12 } })
      await Promise.resolve()
    })

    expect(worker().posted.at(-1)).toEqual({
      type: 'addFiles',
      files: [FILE],
      settings: { massKg: 75, bikeMassKg: 12 },
      sync: { keepFiles: true, userId: USER_ID },
    })
  })

  it('reports a profile-write failure and does not silently import with retention off', async () => {
    const failure = new Error('profile save failed')
    const account: Account = {
      ...SIGNED_IN_NO_KEEP,
      flushProfileWrites: () => Promise.reject(failure),
    }
    const { result } = setup(account)
    act(() => worker().reply({ type: 'state', state: STATE }))

    act(() => result.current.addFiles([FILE]))
    await waitFor(() =>
      expect(result.current.error).toMatch(
        /Retry saving your settings, then add these files again/,
      ),
    )

    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
    expect(result.current.busy).toBe(false)
  })

  it('cancels a profile-waiting import when the signed-in account changes', async () => {
    let finish!: (me: Me | null) => void
    const account: Account = {
      ...SIGNED_IN_NO_KEEP,
      flushProfileWrites: () => new Promise((resolve) => (finish = resolve)),
    }
    const { result, rerender } = setup(account)
    const oldWorker = worker()
    finishLibraryLoad()

    act(() => result.current.addFiles([FILE]))
    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    const nextWorker = worker()
    await act(async () => {
      finish(meWith(true))
      await Promise.resolve()
    })

    expect(oldWorker.terminated).toBe(true)
    expect(nextWorker.posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: 'u2' }])
    await waitFor(() => expect(result.current.error).toMatch(/account changed/))
  })

  it('does not dispatch a profile-waiting import after Stop restarts the worker', async () => {
    let finish!: (me: Me | null) => void
    const account: Account = {
      ...SIGNED_IN_NO_KEEP,
      flushProfileWrites: () => new Promise((resolve) => (finish = resolve)),
    }
    const { result } = setup(account)
    const oldWorker = worker()
    finishLibraryLoad()

    act(() => result.current.addFiles([FILE]))
    act(() => result.current.stop())
    const restartedWorker = worker()
    await act(async () => {
      finish(meWith(true))
      await Promise.resolve()
    })

    expect(oldWorker.terminated).toBe(true)
    expect(restartedWorker.posted).toEqual([
      { type: 'loadServer', settings: SETTINGS, userId: USER_ID },
    ])
    expect(restartedWorker.posted).not.toContainEqual(expect.objectContaining({ type: 'addFiles' }))
    expect(result.current.error).toMatch(/Stopped\. Add your files again/)
  })

  it('keeps syncing digests without uploading files when file retention is unavailable', () => {
    const account = { status: 'signed-in' as const, me: meWith(true, false) }
    const { result } = setup(account)
    finishLibraryLoad()

    act(() => result.current.addFiles([FILE]))

    expect(worker().posted.at(-1)).toEqual({
      type: 'addFiles',
      files: [FILE],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })
  })

  it('preserves file sync for an older API that omits retention capability', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    expect(worker().posted.at(-1)).toMatchObject({
      type: 'addFiles',
      sync: { keepFiles: true, userId: USER_ID },
    })
  })

  it.each<[string, Account]>([
    ['signed out', SIGNED_OUT],
    ['unavailable', UNAVAILABLE],
  ])(
    'analyses the drop while the account loads, then loads the kept library and saves it once %s',
    (_, settled) => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      expect(worker().posted).toEqual([
        { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null, provisional: true },
      ])
      act(() => worker().reply({ type: 'state', state: STATE }))

      rerender({ account: settled, current: SETTINGS })
      expect(worker().posted.slice(1)).toEqual([DEVICE_LOAD])

      // The kept library answers, and only then is the analysis saved, each compared with it.
      act(() => worker().reply({ type: 'state', state: STATE }))
      expect(worker().posted.at(-1)).toEqual({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        saveToDevice: true,
      })

      // A later render with the same account does not send the device load again.
      rerender({ account: { ...settled }, current: SETTINGS })
      expect(worker().posted).toHaveLength(3)
    },
  )

  describe('imports while the account loads', () => {
    /** Answers the first pending request, as the worker does in order. */
    function settle(state: SessionState = STATE) {
      act(() => worker().reply({ type: 'state', state }))
    }

    it('analyses a drop at once, in this session only, and writes nothing until the account is known', () => {
      const { result } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      expect(worker().posted).toEqual([
        { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null, provisional: true },
      ])
    })

    it('sends the analysed files to the account once a sign-in is known and the library has loaded', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      settle()

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      expect(worker().posted.at(-1)).toEqual({
        type: 'loadServer',
        settings: SETTINGS,
        userId: USER_ID,
      })
      settle()
      // Until the library has loaded, the files wait; a failed load must not be followed by an import.
      expect(worker().posted.some((request) => request.type === 'addFiles' && request.sync)).toBe(
        false,
      )

      finishLibraryLoad()
      expect(worker().posted.at(-1)).toEqual({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: { keepFiles: true, userId: USER_ID },
      })
    })

    it('does not sync the analysed files when the library cannot be loaded', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      settle()
      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      settle()

      act(() => worker().reply({ type: 'error', message: 'Library down' }))

      expect(worker().posted.some((request) => request.type === 'addFiles' && request.sync)).toBe(
        false,
      )
      expect(result.current.error).toMatch(/not loaded, so these files were not imported/)
    })

    it('clears the analysed session before the library loads, so a failed load leaves nothing unsaved on screen', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      act(() =>
        worker().reply({
          type: 'state',
          state: { ...STATE, totalActivities: 1 },
          outcome: { activities: 1, rejected: 0, duplicates: [] },
        }),
      )

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      expect(worker().posted.slice(1)).toEqual([
        { type: 'clear', forgetDevice: false },
        { type: 'loadServer', settings: SETTINGS, userId: USER_ID },
      ])
      act(() => worker().reply({ type: 'state', state: STATE }))
      act(() => worker().reply({ type: 'error', message: 'Library down' }))

      expect(result.current.state.totalActivities).toBe(0)
      expect(result.current.importOutcome).toBeNull()
      expect(result.current.error).toMatch(/not loaded, so these files were not imported/)
    })

    it('keeps the chosen period through the clear, so the clear is the only request sent', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      act(() => result.current.setRange(42))
      settle({ ...STATE, totalActivities: 1 })

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })

      const posted = worker().posted
      const clearAt = posted.findIndex((request) => request.type === 'clear')
      expect(posted[clearAt]).toEqual({ type: 'clear', forgetDevice: false })
      expect(posted.slice(clearAt + 1)).not.toContainEqual(
        expect.objectContaining({ type: 'setRange' }),
      )
    })

    it('summarises nothing for the analysis made while the account loads, only for the final import', () => {
      const outcome = { activities: 1, rejected: 0, duplicates: [] }
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      act(() => worker().reply({ type: 'state', state: STATE, outcome }))
      expect(result.current.importOutcome).toBeNull()

      rerender({ account: SIGNED_OUT, current: SETTINGS })
      act(() => worker().reply({ type: 'state', state: STATE }))
      act(() => worker().reply({ type: 'state', state: STATE, outcome }))

      expect(result.current.importOutcome).toEqual(outcome)
    })

    it('holds no files the worker refused, so the page is not left waiting on them', () => {
      const { result, rerender } = setup(LOADING)
      act(() => worker().onerror?.(new ErrorEvent('error', { message: 'boom' })))
      act(() => worker().onerror?.(new ErrorEvent('error', { message: 'boom' })))

      act(() => result.current.addFiles([FILE]))
      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })

      // A later retry loads the library; the refused files must not be synced by it.
      act(() => result.current.retryWorker())
      settle()
      expect(worker().posted.some((request) => request.type === 'addFiles' && request.sync)).toBe(
        false,
      )
    })

    it('syncs two drops made while the account loads, in the order they were made', () => {
      const other = new File(['y'], 'ride.gpx')
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      act(() => result.current.addFiles([other]))
      settle()
      settle()

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      settle()
      finishLibraryLoad()

      const synced = worker().posted.filter(
        (request) => request.type === 'addFiles' && request.sync !== null,
      )
      expect(synced).toEqual([
        {
          type: 'addFiles',
          files: [FILE],
          settings: SETTINGS,
          sync: { keepFiles: true, userId: USER_ID },
        },
        {
          type: 'addFiles',
          files: [other],
          settings: SETTINGS,
          sync: { keepFiles: true, userId: USER_ID },
        },
      ])
    })

    it('loads the kept library for a visitor who turns out signed out, then saves the files to it', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      settle()

      rerender({ account: SIGNED_OUT, current: SETTINGS })
      expect(worker().posted.slice(1)).toEqual([DEVICE_LOAD])

      settle()
      expect(worker().posted.at(-1)).toEqual({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        saveToDevice: true,
      })
    })

    it('does not repeat an import that ran while the account was unavailable when the retries end', () => {
      const { result, rerender } = setup(UNAVAILABLE)
      finishDeviceLoad()
      act(() => result.current.addFiles([FILE]))
      settle()
      const sent = worker().posted.filter((message) => message.type === 'addFiles')
      expect(sent).toHaveLength(1)

      rerender({ account: SIGNED_OUT, current: SETTINGS })
      rerender({ account: UNAVAILABLE, current: SETTINGS })

      expect(worker().posted.filter((message) => message.type === 'addFiles')).toHaveLength(1)
    })

    describe('while the API cannot be reached but the lookup will be tried again', () => {
      const addsOf = () => worker().posted.filter((request) => request.type === 'addFiles')

      /** An import made after the first failed lookup, analysed and answered. */
      function importWhileUnreachable() {
        const hook = setup(UNREACHABLE)
        finishDeviceLoad()
        act(() => hook.result.current.addFiles([FILE]))
        settle()
        return hook
      }

      it('shows the kept library at once and analyses a drop in this session only', () => {
        const { result } = setup(UNREACHABLE)
        expect(worker().posted).toEqual([DEVICE_LOAD])
        finishDeviceLoad()
        act(() => result.current.addFiles([FILE]))
        expect(worker().posted.at(-1)).toEqual({
          type: 'addFiles',
          files: [FILE],
          settings: SETTINGS,
          sync: null,
          provisional: true,
        })
      })

      it('hands the files to the account, never the device, when a retry finds a sign-in', () => {
        const { rerender } = importWhileUnreachable()
        const before = worker()

        rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })

        expect(worker()).toBe(before)
        expect(before.terminated).toBe(false)
        expect(before.posted.map((request) => request.type)).toEqual([
          'loadDevice',
          'addFiles',
          'clear',
          'loadServer',
        ])
        expect(before.posted.find((request) => request.type === 'clear')).toEqual({
          type: 'clear',
          forgetDevice: false,
        })
        // The clear that empties the kept library from the page, then the account's library.
        settle()
        settle()
        const adds = addsOf()
        expect(adds).toHaveLength(2)
        expect(adds.at(-1)).toMatchObject({ files: [FILE], sync: { userId: USER_ID } })
        expect(adds.some((request) => request.saveToDevice === true)).toBe(false)
        expect(worker().posted.some((request) => request.type === 'keepProvisional')).toBe(false)
      })

      it.each([
        ['the retries give up', UNAVAILABLE],
        ['a retry finds nobody signed in', SIGNED_OUT],
      ])('keeps what was analysed, as it is, when %s', (_name, account) => {
        const { rerender } = importWhileUnreachable()
        const before = worker()

        rerender({ account, current: SETTINGS })

        expect(worker()).toBe(before)
        expect(before.posted.at(-1)).toEqual({ type: 'keepProvisional', settings: SETTINGS })
        // One read and one analysis: nothing is sent again, and the kept library is not reloaded.
        expect(addsOf()).toHaveLength(1)
        expect(before.posted.filter((request) => request.type === 'loadDevice')).toHaveLength(1)
      })

      it('sends the files again to a worker that restarted, so giving up still keeps them', () => {
        const { rerender } = importWhileUnreachable()
        const crashed = worker()

        act(() => crashed.onerror?.(new ErrorEvent('error', { message: 'boom' })))
        const restarted = worker()
        expect(restarted).not.toBe(crashed)
        expect(restarted.posted).toEqual([DEVICE_LOAD])

        // The restarted worker has none of the analysis: it loads the kept library, then gets the files.
        finishDeviceLoad()
        expect(restarted.posted.at(-1)).toEqual({
          type: 'addFiles',
          files: [FILE],
          settings: SETTINGS,
          sync: null,
          provisional: true,
        })
        settle()

        rerender({ account: UNAVAILABLE, current: SETTINGS })
        expect(restarted.posted.at(-1)).toEqual({ type: 'keepProvisional', settings: SETTINGS })
      })

      it('says what was kept once the retries give up, which the wait did not show', () => {
        const { result, rerender } = setup(UNREACHABLE)
        finishDeviceLoad()
        const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 1, rides: 1 }
        act(() => result.current.addFiles([FILE]))
        act(() => worker().reply({ type: 'state', state: STATE, outcome }))
        act(() => result.current.addFiles([FILE]))
        act(() => worker().reply({ type: 'state', state: STATE, outcome }))
        expect(result.current.importOutcome).toBeNull()

        rerender({ account: UNAVAILABLE, current: SETTINGS })
        settle()

        expect(result.current.importOutcome).toEqual({
          activities: 4,
          rejected: 0,
          duplicates: [],
          runs: 2,
          rides: 2,
        })
      })

      it('ignores the kept library’s late replies once a sign-in is found, even if the account fails to load', () => {
        const { result, rerender } = setup(UNREACHABLE)
        act(() => result.current.addFiles([FILE]))
        rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
        const device = {
          id: 'run-1',
          name: 'Run',
          startMs: Date.UTC(2026, 9, 20),
          sport: 'run' as const,
          copy: SAVED_COPY,
        }

        // The kept library's answer arrives late: its list, then its state.
        act(() => worker().reply({ type: 'libraryActivities', activities: [device] }))
        act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 5 } }))
        expect(result.current.savedActivities).toEqual([])
        expect(result.current.state.totalActivities).toBe(0)

        // Then the provisional analysis (dropped), the clear, and a library that fails to load.
        settle({ ...STATE, totalActivities: 1 })
        settle()
        act(() => worker().reply({ type: 'error', message: 'Library down' }))
        expect(result.current.savedActivities).toEqual([])
        expect(result.current.state.totalActivities).toBe(0)
      })

      it('sends the files again, as a signed-out import, when giving up lands with a restart', () => {
        const { rerender } = importWhileUnreachable()
        const crashed = worker()

        act(() => {
          crashed.onerror?.(new ErrorEvent('error', { message: 'boom' }))
          rerender({ account: UNAVAILABLE, current: SETTINGS })
        })
        const restarted = worker()
        expect(restarted).not.toBe(crashed)
        finishDeviceLoad()

        expect(restarted.posted.some((request) => request.type === 'keepProvisional')).toBe(false)
        expect(restarted.posted.at(-1)).toEqual({
          type: 'addFiles',
          files: [FILE],
          settings: SETTINGS,
          sync: null,
          saveToDevice: true,
        })
      })

      it('sends nothing to keep when no file was analysed meanwhile', () => {
        const { rerender } = setup(UNREACHABLE)
        finishDeviceLoad()
        rerender({ account: UNAVAILABLE, current: SETTINGS })
        expect(worker().posted).toEqual([DEVICE_LOAD])
      })

      it('carries a drop made before the first failure over the kept library, in this session only', () => {
        const { result, rerender } = setup(LOADING)
        act(() => result.current.addFiles([FILE]))
        settle()

        rerender({ account: UNREACHABLE, current: SETTINGS })
        expect(worker().posted.at(-1)).toEqual(DEVICE_LOAD)
        settle()

        expect(worker().posted.at(-1)).toEqual({
          type: 'addFiles',
          files: [FILE],
          settings: SETTINGS,
          sync: null,
          provisional: true,
        })
      })
    })

    it('saves the files for a visitor whose account is unavailable, as for a signed-out one', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      settle()

      rerender({ account: UNAVAILABLE, current: SETTINGS })
      expect(worker().posted.slice(1)).toEqual([DEVICE_LOAD])

      settle()
      expect(worker().posted.at(-1)).toEqual({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        saveToDevice: true,
      })
    })

    it('sends the files again after a worker restart while the account loads, and keeps them if nobody is signed in', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      settle()
      const crashed = worker()

      act(() => crashed.onerror?.(new ErrorEvent('error', { message: 'boom' })))
      const restarted = worker()
      expect(restarted).not.toBe(crashed)
      expect(restarted.posted).toEqual([])

      rerender({ account: SIGNED_OUT, current: SETTINGS })
      expect(restarted.posted).toEqual([DEVICE_LOAD])
      settle()

      expect(restarted.posted.some((request) => request.type === 'keepProvisional')).toBe(false)
      expect(restarted.posted.at(-1)).toEqual({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        saveToDevice: true,
      })
    })

    it('says the stop without claiming results are kept, while the account is still loading', () => {
      const { result } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))

      act(() => result.current.stop())

      expect(result.current.error).toMatch(/Stopped\. Add your files again/)
      expect(result.current.error).not.toMatch(/kept/)
    })

    it('forgets the analysed files when the visitor stops, so a later sign-in does not sync them', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      act(() => result.current.stop())

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })

      expect(worker().posted.some((request) => request.type === 'addFiles')).toBe(false)
    })

    it('forgets the analysed files when the visitor starts over, so a later sign-in does not sync them', () => {
      const { result, rerender } = setup(LOADING)
      act(() => result.current.addFiles([FILE]))
      settle()
      act(() => result.current.clear())
      settle()

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      finishLibraryLoad()

      expect(worker().posted.some((request) => request.type === 'addFiles' && request.sync)).toBe(
        false,
      )
    })
  })

  describe('restoring the library kept in this browser', () => {
    const KEPT_KEY = 'rca.kept.v1'
    const WITH_RESULTS: SessionState = { ...STATE, totalActivities: 2 }

    beforeEach(() => localStorage.clear())

    it('shows a restoring state while the account loads, after a visit that kept results', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(LOADING)
      expect(result.current.restoring).toBe(true)
    })

    it('shows no restoring state on a first visit', () => {
      const { result } = setup(LOADING)
      expect(result.current.restoring).toBe(false)
    })

    it('ends the restoring state once the kept library has loaded, and keeps the hint', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)

      reportKept(2)
      finishDeviceLoad(WITH_RESULTS)

      expect(result.current.restoring).toBe(false)
      expect(localStorage.getItem(KEPT_KEY)).toBe('1')
    })

    it('forgets the hint and ends the restoring state when the kept library loads empty', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)
      expect(result.current.restoring).toBe(true)

      finishDeviceLoad(STATE)

      expect(result.current.restoring).toBe(false)
      expect(localStorage.getItem(KEPT_KEY)).toBeNull()
    })

    it('ends the restoring state when the signed-in library loads', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_IN_KEEP)

      finishLibraryLoad(WITH_RESULTS)

      expect(result.current.restoring).toBe(false)
    })

    it('ends the restoring state when the worker stops for good', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)

      act(() => worker().onerror?.(new ErrorEvent('error', { message: 'boom' })))
      act(() => worker().onerror?.(new ErrorEvent('error', { message: 'boom' })))

      expect(result.current.restoring).toBe(false)
    })

    it('keeps the hint once an import saved to this browser has results', () => {
      const { result } = setup(SIGNED_OUT)
      finishDeviceLoad(STATE)

      act(() => result.current.addFiles([FILE]))
      reportKept(2)
      act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 2 } }))

      expect(localStorage.getItem(KEPT_KEY)).toBe('1')
    })

    it('does not set the hint from the session when every save in the import was refused', () => {
      const { result } = setup(SIGNED_OUT)
      reportKept(0)
      finishDeviceLoad(STATE)

      act(() => result.current.addFiles([FILE]))
      reportKept(0)
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notSaved', count: 2 }))
      act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 2 } }))

      expect(localStorage.getItem(KEPT_KEY)).toBeNull()
      expect(result.current.deviceIssue).toEqual({ issue: 'notSaved', count: 2 })
    })

    it('keeps how many were left to a newer version of the app', () => {
      const { result } = setup(SIGNED_OUT)
      finishDeviceLoad(STATE)
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notSaved', count: 0, newer: 2 }))
      expect(result.current.deviceIssue).toEqual({ issue: 'notSaved', count: 0, newer: 2 })
    })

    it('clears the refusal when the next import is sent, and shows it again if that one fails too', () => {
      const { result } = setup(SIGNED_OUT)
      finishDeviceLoad(STATE)
      act(() => result.current.addFiles([FILE]))
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notSaved', count: 1 }))
      act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 1 } }))
      expect(result.current.deviceIssue).toEqual({ issue: 'notSaved', count: 1 })

      act(() => result.current.addFiles([FILE]))
      expect(result.current.deviceIssue).toBeNull()
      act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 1 } }))
      expect(result.current.deviceIssue).toBeNull()
    })

    it('drops the news of unsaved imports when the sample is loaded, and when the visitor signs in', () => {
      const { result, rerender } = setup(SIGNED_OUT)
      finishDeviceLoad(STATE)
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notSaved', count: 1 }))
      expect(result.current.deviceIssue).toEqual({ issue: 'notSaved', count: 1 })

      act(() => result.current.loadSample())
      expect(result.current.deviceIssue).toBeNull()

      act(() => worker().reply({ type: 'deviceIssue', issue: 'notSaved', count: 2 }))
      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      expect(result.current.deviceIssue).toBeNull()
    })

    it('keeps a refused delete through the sample and an account change, since the copy stays in this browser', () => {
      const { result, rerender } = setup(SIGNED_OUT)
      finishDeviceLoad(STATE)
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notForgotten' }))

      act(() => result.current.loadSample())
      expect(result.current.deviceIssue).toEqual({ issue: 'notForgotten' })

      rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
      expect(result.current.deviceIssue).toEqual({ issue: 'notForgotten' })
    })

    it('keeps a refused signed-in delete through sign-out, until this browser is asked again', () => {
      const { result, rerender } = setup(SIGNED_IN_KEEP)
      finishLibraryLoad(STATE)
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notForgotten' }))
      expect(result.current.deviceIssue).toEqual({ issue: 'notForgotten' })

      rerender({ account: SIGNED_OUT, current: SETTINGS })
      expect(result.current.deviceIssue).toEqual({ issue: 'notForgotten' })

      // The worker that started on sign-out reads this browser's library, which retries it.
      act(() => result.current.clear())
      expect(result.current.deviceIssue).toBeNull()
    })

    it('keeps the hint and says so when a forget could not clear what is kept', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)
      reportKept(2)
      finishDeviceLoad(WITH_RESULTS)

      act(() => result.current.clear())
      reportKept(2)
      act(() => worker().reply({ type: 'deviceIssue', issue: 'notForgotten' }))
      act(() => worker().reply({ type: 'state', state: STATE }))

      expect(localStorage.getItem(KEPT_KEY)).toBe('1')
      expect(result.current.deviceIssue).toEqual({ issue: 'notForgotten' })
      expect(result.current.savedActivities).toHaveLength(2)

      // Trying again sends the same clear, and the refusal is gone once it succeeds.
      act(() => result.current.clear())
      expect(worker().posted.at(-1)).toEqual({ type: 'clear', forgetDevice: true })
      expect(result.current.deviceIssue).toBeNull()
      act(() => worker().reply({ type: 'libraryActivities', activities: [] }))
      act(() => worker().reply({ type: 'state', state: STATE }))
      expect(localStorage.getItem(KEPT_KEY)).toBeNull()
      expect(result.current.deviceIssue).toBeNull()
    })

    it('forgets the hint when the library is cleared', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)
      reportKept(2)
      finishDeviceLoad(WITH_RESULTS)

      act(() => result.current.clear())
      act(() => worker().reply({ type: 'libraryActivities', activities: [] }))
      act(() => worker().reply({ type: 'state', state: STATE }))

      expect(localStorage.getItem(KEPT_KEY)).toBeNull()
    })

    it('forgets the hint when an import leaves the library empty', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)
      reportKept(2)
      finishDeviceLoad(WITH_RESULTS)

      act(() => result.current.addFiles([FILE]))
      act(() => worker().reply({ type: 'libraryActivities', activities: [] }))
      act(() => worker().reply({ type: 'state', state: STATE }))

      expect(localStorage.getItem(KEPT_KEY)).toBeNull()
    })

    it('ends the restoring state when the library fails to load', () => {
      localStorage.setItem(KEPT_KEY, '1')
      const { result } = setup(SIGNED_OUT)

      act(() => worker().reply({ type: 'error', message: 'Storage refused' }))

      expect(result.current.restoring).toBe(false)
    })
  })

  it('sends no sync option when the account is unavailable', () => {
    const { result } = setup({ status: 'unavailable', me: null })
    act(() => result.current.addFiles([FILE]))
    expect(worker().posted).toEqual([
      DEVICE_LOAD,
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null, saveToDevice: true },
    ])
  })

  it('does not post an import with no files', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([]))
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })
})

describe('useAnalysis device library', () => {
  it('sends the device load once, when the account turns out signed out', () => {
    const { rerender } = setup(LOADING)
    expect(worker().posted).toEqual([])

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('sends the device load when the page opens signed out', () => {
    setup(SIGNED_OUT)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('sends one device load to the surviving worker under StrictMode when signed out', () => {
    renderHook(
      ({ account, current }: { account: Account; current: AthleteSettings }) =>
        useAnalysis(current, account, false),
      {
        initialProps: { account: SIGNED_OUT, current: SETTINGS },
        wrapper: StrictWrapper,
        reactStrictMode: true,
      },
    )
    expect(FakeWorker.instances).toHaveLength(2)
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('does not send the device load when a worker restarts for a signed-in account', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    const first = worker()
    act(() => result.current.stop())

    expect(first.terminated).toBe(true)
    expect(worker()).not.toBe(first)
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('never sends the device load after a signed-in worker restarts and the session expires', () => {
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    act(() => result.current.stop())

    rerender({
      account: { status: 'signed-out', me: null, markExpired, sessionExpired: true },
      current: SETTINGS,
    })

    const sent = FakeWorker.instances.flatMap((instance) => instance.posted.map((r) => r.type))
    // The expired session also tells the worker to forget its route shapes; no device load is sent.
    expect(sent).toEqual(['loadServer', 'loadServer', 'forgetRoutes'])
  })

  it('sends the device load again to a signed-out worker that is restarted', () => {
    const { result } = setup(SIGNED_OUT)
    const first = worker()
    act(() => result.current.stop())

    expect(first.terminated).toBe(true)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('sends the device load again to a signed-out worker that crashed and was replaced', () => {
    const { result } = setup(SIGNED_OUT)
    const crashed = worker()
    act(() => crashed.onerror?.({ message: 'Script failed' } as ErrorEvent))

    expect(result.current.workerStopped).toBe(false)
    expect(worker()).not.toBe(crashed)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('sends the device load to the new worker after a sign-out', () => {
    const { rerender } = setup(SIGNED_IN_KEEP)
    const signedInWorker = worker()

    rerender({ account: SIGNED_OUT, current: SETTINGS })

    expect(signedInWorker.terminated).toBe(true)
    expect(worker()).not.toBe(signedInWorker)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('deletes a device-kept activity as a library action until the worker replies', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const { result } = setup(SIGNED_OUT)
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'run-1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )
    finishDeviceLoad()

    act(() => result.current.deleteActivity('run-1'))
    expect(worker().posted.at(-1)).toEqual({
      type: 'deleteDeviceActivity',
      id: 'run-1',
      settings: SETTINGS,
    })
    expect(result.current.libraryAction).toBe('deleting')
    expect(result.current.busy).toBe(false)

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.libraryAction).toBeNull()
    expect(result.current.libraryNotice).toBe(`Deleted Morning run (${formatDay(startMs)}).`)
  })

  it('clears the account library without forgetting the device library while signed in', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.clear())
    expect(worker().posted.at(-1)).toEqual({ type: 'clear', forgetDevice: false })
  })
})

describe('useAnalysis requests', () => {
  it('posts sample, range and clear requests with the current settings', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.loadSample())
    act(() => result.current.setRange(42))
    act(() => result.current.clear())

    expect(worker().posted).toEqual([
      DEVICE_LOAD,
      { type: 'loadSample', settings: SETTINGS },
      { type: 'setRange', choice: 42, settings: SETTINGS },
      { type: 'clear', forgetDevice: true },
    ])
  })

  it('names the period picked on this device in the library and sample loads', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(365))
    try {
      const { result } = setup(SIGNED_OUT)
      act(() => result.current.loadSample())
      expect(worker().posted).toEqual([
        { type: 'loadDevice', settings: SETTINGS, choice: 365 },
        { type: 'loadSample', settings: SETTINGS, choice: 365 },
      ])
    } finally {
      localStorage.removeItem(PERIOD_KEY)
    }
  })

  it('asks the worker to grade the trend once the athlete has an age and sex, and only then', () => {
    const { rerender } = renderHook(
      ({ grade }: { grade: boolean }) => useAnalysis(SETTINGS, SIGNED_OUT, grade),
      { initialProps: { grade: false } },
    )
    expect(worker().posted).toEqual([DEVICE_LOAD])
    rerender({ grade: true })
    expect(worker().posted).toEqual([
      DEVICE_LOAD,
      { type: 'setGradeTrend', on: true, settings: SETTINGS },
    ])
    rerender({ grade: true })
    expect(worker().posted).toHaveLength(2)
    rerender({ grade: false })
    expect(worker().posted.at(-1)).toEqual({ type: 'setGradeTrend', on: false, settings: SETTINGS })
  })

  it('posts new settings only when the body or bike mass changes', () => {
    const { rerender } = setup(SIGNED_OUT, SETTINGS)
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([DEVICE_LOAD])

    const changed = { massKg: 80, bikeMassKg: 9 }
    rerender({ account: SIGNED_OUT, current: changed })
    expect(worker().posted).toEqual([DEVICE_LOAD, { type: 'setSettings', settings: changed }])
  })

  it('stops the worker on unmount', () => {
    const { unmount } = setup(SIGNED_OUT)
    const created = worker()
    unmount()
    expect(created.terminated).toBe(true)
  })
})

describe('useAnalysis state', () => {
  it('exposes the sync issues an import reports and clears them when the library is cleared', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, syncIssues: [{ code: 'storage-budget', count: 1 }] },
      }),
    )
    expect(result.current.state.syncIssues).toEqual([{ code: 'storage-budget', count: 1 }])

    act(() => result.current.clear())
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.state.syncIssues).toEqual([])
  })

  it('ignores an account issue from a prior account worker', () => {
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    const workerA = worker()
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => workerA.reply({ type: 'accountIssue', issue: 'signed-out' }))
    expect(markExpired).not.toHaveBeenCalled()
  })

  it('drops imports held while the library loads when that load fails, and asks for them to be added again', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    expect(result.current.waitingReason).toBe('Checking your saved results…')
    act(() => worker().reply({ type: 'error', message: 'Network down' }))

    expect(result.current.libraryStatus).toBe('failed')
    expect(result.current.waitingReason).toBeNull()
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toMatch(/not imported.*add them again/)

    // A retry must not run the dropped files later.
    act(() => result.current.retryLibrary())
    finishLibraryLoad()
    expect(result.current.libraryStatus).toBe('loaded')
    expect(worker().posted.some((request) => request.type === 'addFiles')).toBe(false)
  })

  it('refuses an import while the library is not loaded, rather than holding it', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => worker().reply({ type: 'error', message: 'Network down' }))
    act(() => result.current.addFiles([FILE]))

    expect(result.current.waitingReason).toBeNull()
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toMatch(/not imported.*add them again/)
  })

  it('reports imports held while the library loads as busy, and clears the reason once it loads', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    expect(result.current.busy).toBe(true)
    expect(result.current.waitingReason).toBe('Checking your saved results…')

    finishLibraryLoad()
    expect(result.current.waitingReason).toBeNull()
    expect(result.current.busy).toBe(true)
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.busy).toBe(false)
  })

  it('signs the account out after a sign-out during an import, and keeps the activities on screen', () => {
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    const workerA = worker()
    finishLibraryLoad({ ...STATE, totalActivities: 3 })
    act(() => result.current.addFiles([FILE]))

    act(() => workerA.reply({ type: 'accountIssue', issue: 'signed-out' }))
    expect(markExpired).toHaveBeenCalledOnce()

    // The session ended, so the account is signed out and the saved library is not cleared.
    rerender({
      account: { status: 'signed-out', me: null, markExpired, sessionExpired: true },
      current: SETTINGS,
    })
    expect(result.current.state.totalActivities).toBe(3)
    expect(worker()).toBe(workerA)
    expect(workerA.terminated).toBe(false)
    expect(result.current.libraryStatus).toBe('idle')
  })

  it('reloads the same account when the server reports an account change during an import', async () => {
    const refresh = vi.fn(async () => meWith(true))
    const { result } = setup({ ...SIGNED_IN_KEEP, refresh })
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'accountIssue', issue: 'account-changed' }))

    await waitFor(() =>
      expect(worker().posted.at(-1)).toEqual({
        type: 'loadServer',
        settings: SETTINGS,
        userId: USER_ID,
      }),
    )
    expect(refresh).toHaveBeenCalledOnce()
  })

  it.each(['daily-limit', 'activity-quota', 'rate-limited'] as const)(
    'leaves the account alone when an import stops at %s',
    (issue) => {
      const markExpired = vi.fn()
      const refresh = vi.fn(async () => meWith(true))
      const { result } = setup({ ...SIGNED_IN_KEEP, markExpired, refresh })
      finishLibraryLoad()
      act(() => result.current.addFiles([FILE]))
      const posted = worker().posted.length

      act(() => worker().reply({ type: 'accountIssue', issue }))

      expect(markExpired).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
      expect(worker().posted).toHaveLength(posted)
    },
  )

  it('clears the sync issues when the user signs in', () => {
    const { result, rerender } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, syncIssues: [{ code: 'signed-out', count: 1 }] },
      }),
    )
    expect(result.current.state.syncIssues).toEqual([{ code: 'signed-out', count: 1 }])

    const signedOutWorker = worker()
    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    expect(worker()).not.toBe(signedOutWorker)
    expect(result.current.state.syncIssues).toEqual([])
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('refuses sample data while a signed-in library is shown, and sends nothing', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.loadSample())

    expect(worker().posted.some((request) => request.type === 'loadSample')).toBe(false)
    expect(result.current.error).toMatch(/cannot replace your saved library/)
  })

  it('exposes how many saved activities are missing their original file', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => worker().reply({ type: 'missingOriginals', count: 2 }))
    expect(result.current.missingOriginals).toBe(2)
    finishLibraryLoad()
    expect(result.current.missingOriginals).toBe(2)
  })

  it('exposes which activities hold detailed readings, and forgets them when the sample loads', () => {
    const { result } = setup()
    expect(result.current.detail).toBeNull()
    act(() =>
      worker().reply({ type: 'detailCoverage', ids: ['a', 'b'], oldestStartMs: 1_700_000_000_000 }),
    )
    expect(result.current.detail?.ids.has('a')).toBe(true)
    expect(result.current.detail?.ids.has('z')).toBe(false)
    expect(result.current.detail?.oldestStartMs).toBe(1_700_000_000_000)

    act(() => result.current.loadSample())
    expect(result.current.detail).toBeNull()
  })

  it('takes the outdated activities that have an original from the same reply as the state', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    const outdated = { ...STATE, outdatedActivities: 3 }
    // The missing count arrives ahead of the state and does not move the outdated count.
    act(() => worker().reply({ type: 'missingOriginals', count: 3 }))
    expect(result.current.outdatedWithOriginal).toBe(0)
    act(() => worker().reply({ type: 'state', state: outdated, outdatedWithOriginal: 2 }))
    expect(result.current.state.outdatedActivities).toBe(3)
    expect(result.current.outdatedWithOriginal).toBe(2)

    act(() => result.current.rebuildSavedActivities())
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: { ...STATE, outdatedActivities: 1 },
        outdatedWithOriginal: 0,
        rebuilt: 2,
        missing: 1,
        failed: 0,
        limited: 0,
        limitKind: null,
        limitResetsAtMs: null,
      }),
    )
    expect(result.current.state.outdatedActivities).toBe(1)
    expect(result.current.outdatedWithOriginal).toBe(0)
  })

  it('refuses a signed-out import made while the worker is stopped, and does not run it after a restart', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))
    const stopped = worker()

    act(() => result.current.addFiles([FILE]))
    expect(stopped.posted).toEqual([DEVICE_LOAD])
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toMatch(/did not run.*try again/)

    act(() => result.current.retryWorker())
    expect(worker()).not.toBe(stopped)
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('refuses a signed-in import made after the worker stopped and the library failed, and does not run it after a restart', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))
    expect(result.current.workerStopped).toBe(true)

    act(() => result.current.addFiles([FILE]))
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toMatch(/not imported.*add them again/)

    act(() => result.current.retryWorker())
    finishLibraryLoad()
    expect(worker().posted.some((request) => request.type === 'addFiles')).toBe(false)
  })

  it('reports busy until the reply arrives and exposes the state it carries', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => result.current.loadSample())
    expect(result.current.busy).toBe(true)

    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, syncIssues: [{ code: 'server', count: 2 }], totalActivities: 5 },
      }),
    )
    expect(result.current.busy).toBe(false)
    expect(result.current.state.syncIssues).toEqual([{ code: 'server', count: 2 }])
    expect(result.current.state.totalActivities).toBe(5)
  })

  it('tracks files read and uploads during an import, and clears them when it finishes', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    expect(result.current.progress).toBeNull()
    expect(result.current.uploading).toBeNull()

    act(() => worker().reply({ type: 'progress', filesRead: 3, uploaded: 2 }))
    expect(result.current.progress).toEqual({ filesRead: 3, filesTotal: null })
    expect(result.current.uploading).toBe(2)

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.progress).toBeNull()
    expect(result.current.uploading).toBeNull()
  })

  it('says how many a signed-in import saved when its last progress and its reply arrive together', () => {
    // The sync status as the app renders it, fed by the hook.
    function Status() {
      const analysis = useAnalysis(SETTINGS, SIGNED_IN_KEEP, false)
      return createElement(SyncStatus, {
        uploading: analysis.uploading,
        savedCount: analysis.savedCount,
        issues: analysis.state.syncIssues,
        signedIn: true,
      })
    }
    render(createElement(Status))
    finishLibraryLoad()
    act(() => worker().reply({ type: 'progress', filesRead: 0, filesTotal: 3, uploaded: 0 }))
    act(() => worker().reply({ type: 'progress', filesRead: 1, filesTotal: 3, uploaded: 1 }))

    // One render sees both, so the progress that says 3 is never drawn.
    act(() => {
      worker().reply({ type: 'progress', filesRead: 3, filesTotal: 3, uploaded: 3 })
      worker().reply({ type: 'state', state: STATE, saved: 3 })
    })

    expect(document.querySelector('.sync-status__message')).toHaveTextContent(
      'Saved 3 activities to your library.',
    )
  })

  it('says why a paused import waits, and stops saying it with the next progress', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    expect(result.current.waitingReason).toBeNull()

    act(() =>
      worker().reply({ type: 'progress', filesRead: 3, filesTotal: 9, uploaded: 2, paused: true }),
    )
    expect(result.current.waitingReason).toBe(
      'Too many saves at once. Saving resumes in about a minute.',
    )
    expect(result.current.progress).toEqual({ filesRead: 3, filesTotal: 9, paused: true })
    expect(result.current.uploading).toBe(2)

    act(() => worker().reply({ type: 'progress', filesRead: 4, filesTotal: 9, uploaded: 3 }))
    expect(result.current.waitingReason).toBeNull()
    expect(result.current.progress).toEqual({ filesRead: 4, filesTotal: 9 })
  })

  it('stops saying a paused import waits when its state arrives', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'progress', filesRead: 1, uploaded: 0, paused: true }))
    expect(result.current.waitingReason).not.toBeNull()

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.waitingReason).toBeNull()
  })

  it('keeps the result on screen when the visitor stops, and says so as news rather than a fault', () => {
    const result = { ...STATE, totalActivities: 1 }
    const { result: hook } = setup(SIGNED_OUT)
    finishDeviceLoad(result)
    act(() => hook.current.addFiles([FILE]))
    act(() => hook.current.stop())

    expect(hook.current.error).toBe("Stopped. Add your files again when you're ready.")
    expect(hook.current.errorNeutral).toBe(true)
    expect(hook.current.state.totalActivities).toBe(1)
  })

  it('reports a fault that comes after a stop as a fault, not as the neutral stop', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad(STATE)
    act(() => result.current.stop())
    expect(result.current.errorNeutral).toBe(true)

    act(() => worker().reply({ type: 'error', message: 'The file could not be read.' }))
    expect(result.current.error).toBe('The file could not be read.')
    expect(result.current.errorNeutral).toBe(false)
  })

  it('clears the summary when an activity is deleted from the account, as it is from this browser', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    expect(result.current.importOutcome).toEqual(outcome)

    act(() => result.current.deleteActivity('1-run'))
    expect(worker().posted.at(-1)).toMatchObject({ type: 'deleteActivity' })
    expect(result.current.importOutcome).toBeNull()
  })

  it('clears the summary of the last import when an activity is deleted, since its count has changed', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result: hook } = setup(SIGNED_OUT)
    finishDeviceLoad(STATE)
    act(() => hook.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    expect(hook.current.importOutcome).toEqual(outcome)

    act(() => hook.current.deleteActivity('1-run'))
    expect(hook.current.importOutcome).toBeNull()
  })

  it('drops the summary of the last import when the library is cleared or replaced by the sample', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    expect(result.current.importOutcome).toEqual(outcome)

    act(() => result.current.clear())
    expect(result.current.importOutcome).toBeNull()

    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    act(() => result.current.loadSample())
    expect(result.current.importOutcome).toBeNull()
  })

  it('clears the summary of the last import as soon as the next one is sent', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    act(() => result.current.addFiles([FILE]))
    expect(result.current.importOutcome).toBeNull()
  })

  it('leaves no summary behind when an import fails', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'error', message: 'Could not read the file' }))
    expect(result.current.importOutcome).toBeNull()
  })

  it('clears the summary when the worker stops on its own', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    act(() => worker().onerror?.({ message: 'failed' } as ErrorEvent))
    expect(result.current.importOutcome).toBeNull()
    expect(result.current.importChange).toBeNull()
  })

  it('clears the summary when the user stops the analysis', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    act(() => result.current.stop())
    expect(result.current.importOutcome).toBeNull()
    expect(result.current.importChange).toBeNull()
  })

  it('keeps the result an import was added to and the one it made, for what moved', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const before = makeResult({ runCp: null })
    const after = makeResult()
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, result: before })
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: after }, outcome }))
    expect(result.current.importChange).toEqual({ outcome, before, after })
  })

  it('compares the import with nothing when the sample was on screen', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, result: makeResult(), isSample: true })
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: makeResult() }, outcome }))
    expect(result.current.importChange?.before).toBeNull()
  })

  it('forgets what moved when the summary is cleared', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: makeResult() }, outcome }))
    expect(result.current.importChange).not.toBeNull()
    act(() => result.current.clear())
    expect(result.current.importChange).toBeNull()
  })

  it('clears what moved when a signed-in account signs out', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: makeResult() }, outcome }))
    expect(result.current.importChange).not.toBeNull()
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(result.current.importChange).toBeNull()
  })

  it('compares two imports sent together with the result on screen when the first was sent', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const shown = makeResult({ runCp: null })
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, result: shown })
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.addFiles([FILE]))
    const other = makeResult({ runCp: null, rideCp: null })
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: other }, outcome }))
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: makeResult() }, outcome }))
    expect(result.current.importChange?.before).toBe(shown)
  })

  it('drops what moved when the summary is dismissed', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: makeResult() }, outcome }))
    expect(result.current.importChange).not.toBeNull()
    act(() => result.current.dismissSummary())
    expect(result.current.importChange).toBeNull()
  })

  it('keeps the baseline of an import still in flight when the summary is dismissed', () => {
    const outcome = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }
    const shown = makeResult({ runCp: null })
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, result: shown })
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.dismissSummary())
    act(() => worker().reply({ type: 'state', state: { ...STATE, result: makeResult() }, outcome }))
    expect(result.current.importChange?.before).toBe(shown)
  })

  it('reports no uploads for a progress message that carries none', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'progress', filesRead: 1 }))
    expect(result.current.progress).toEqual({ filesRead: 1, filesTotal: null })
    expect(result.current.uploading).toBeNull()
  })

  it('carries the total of activity files an import holds with its progress', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'progress', filesRead: 2, filesTotal: 9 }))
    expect(result.current.progress).toEqual({ filesRead: 2, filesTotal: 9 })
  })

  it('shows a worker error message and stops being busy', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => result.current.clear())
    act(() => worker().reply({ type: 'error', message: 'Disk full' }))
    expect(result.current.error).toBe('Disk full')
    expect(result.current.busy).toBe(false)
  })

  it('keeps the page available while the library kept in this browser loads', () => {
    const { result } = setup(SIGNED_OUT)
    expect(worker().posted).toEqual([DEVICE_LOAD])
    expect(result.current.busy).toBe(false)

    // The sample asked for meanwhile is queued after the load, in order.
    act(() => result.current.loadSample())
    expect(worker().posted).toEqual([DEVICE_LOAD, { type: 'loadSample', settings: SETTINGS }])
  })

  it('reports a worker crash with its message, or a fallback when it has none', () => {
    const { result } = setup(SIGNED_OUT)
    const stoppedWorker = worker()
    act(() => result.current.clear())
    act(() => stoppedWorker.onerror?.({ message: 'Script failed' } as ErrorEvent))
    expect(result.current.error).toMatch(/Analysis stopped unexpectedly.*add again/i)
    expect(stoppedWorker.terminated).toBe(true)
    expect(worker()).not.toBe(stoppedWorker)
    // The new worker reloads the library kept in this browser. That load does not hold the page
    // busy, and the crash message stays. A reply would mark the worker healthy, so none is sent.
    expect(worker().posted).toEqual([DEVICE_LOAD])
    expect(result.current.busy).toBe(false)

    const retryingWorker = worker()
    act(() => result.current.clear())
    act(() => worker().onerror?.({ message: '' } as ErrorEvent))
    expect(result.current.error).toMatch(/Analysis stopped unexpectedly.*add again/i)
    expect(result.current.workerStopped).toBe(true)
    expect(worker()).toBe(retryingWorker)
  })

  it('clears the summary of the last import when a rebuild replaces the session, so no count outlives its skipped files', () => {
    const outcome = { activities: 2, rejected: 1, duplicates: [], runs: 2, rides: 0 }
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'state', state: STATE, outcome }))
    expect(result.current.importOutcome).toEqual(outcome)

    act(() => result.current.rebuildSavedActivities())
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: STATE,
        rebuilt: 0,
        missing: 0,
        failed: 0,
        limited: 0,
        limitKind: null,
        limitResetsAtMs: null,
      }),
    )
    expect(result.current.importOutcome).toBeNull()
  })

  it('requests a saved-activity rebuild and exposes its partial recovery notice', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.rebuildSavedActivities())
    expect(worker().posted.at(-1)).toEqual({
      type: 'rebuildStale',
      settings: SETTINGS,
      userId: USER_ID,
    })
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: { ...STATE, outdatedActivities: 2 },
        rebuilt: 1,
        missing: 1,
        failed: 0,
        limited: 0,
        limitKind: null,
        limitResetsAtMs: null,
      }),
    )
    expect(result.current.state.outdatedActivities).toBe(2)
    expect(result.current.rebuildNotice).toMatch(/add (that|those) original file/)
  })

  it('keeps the missing-file and retry guidance when both rebuild outcomes occur', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.rebuildSavedActivities())
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: { ...STATE, outdatedActivities: 2 },
        rebuilt: 1,
        missing: 1,
        failed: 2,
        limited: 0,
        limitKind: null,
        limitResetsAtMs: null,
      }),
    )
    expect(result.current.rebuildNotice).toMatch(/add (that|those) original file/)
    expect(result.current.rebuildNotice).toMatch(/2 could not be updated; try again/)
  })

  it('says which activities the daily limit left unrebuilt, and when the limit resets', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    const resetsAt = Date.UTC(2026, 9, 23)
    act(() => result.current.rebuildSavedActivities())
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: { ...STATE, outdatedActivities: 3 },
        rebuilt: 2,
        missing: 0,
        failed: 0,
        limited: 3,
        limitKind: 'daily',
        limitResetsAtMs: resetsAt,
      }),
    )
    expect(result.current.rebuildNotice).toBe(
      `Updated 2 saved activities. 3 activities were not updated because today's limit on downloads (50 per day) was reached. It resets at ${localTime(resetsAt)}, your time.`,
    )
  })

  it('tells the user to slow down, not to wait for a daily reset, when the server rate-limits', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.rebuildSavedActivities())
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: { ...STATE, outdatedActivities: 1 },
        rebuilt: 0,
        missing: 0,
        failed: 0,
        limited: 1,
        limitKind: 'rate',
        limitResetsAtMs: Date.now() + 60_000,
      }),
    )
    expect(result.current.rebuildNotice).toBe(
      'Updated 0 saved activities. 1 activity was not updated. The server asked us to slow down; try again in a minute.',
    )
  })

  it('gives the next UTC midnight as the reset when the server gives no reset time', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.rebuildSavedActivities())
    act(() =>
      worker().reply({
        type: 'rebuildComplete',
        state: { ...STATE, outdatedActivities: 1 },
        rebuilt: 0,
        missing: 0,
        failed: 0,
        limited: 1,
        limitKind: 'daily',
        limitResetsAtMs: null,
      }),
    )
    expect(result.current.rebuildNotice).toMatch(
      /^Updated 0 saved activities\. 1 activity was not updated because today's limit on downloads \(50 per day\) was reached\. It resets at .+, your time\.$/,
    )
    expect(result.current.rebuildNotice).not.toMatch(/server is available/)
  })

  it('states the daily limit and its reset for an import, with no generic error prefix', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.errorIssue).toBe('daily-limit')
    expect(result.current.error).toMatch(
      new RegExp(`^You have reached today's limit on saves \\(5,000 per day\\)\\. `),
    )
    expect(result.current.error).toMatch(RESET_AT_UTC_MIDNIGHT)
  })

  it('keeps the worker-stopped message when a worker stops while imports are held', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))

    expect(result.current.workerStopped).toBe(true)
    expect(result.current.error).toMatch(/Analysis stopped unexpectedly.*Restart analysis/i)
  })

  it('says an import was interrupted when the worker restarts while its profile is saving', async () => {
    let finish!: (me: Me | null) => void
    const account: Account = {
      ...SIGNED_IN_NO_KEEP,
      flushProfileWrites: () => new Promise((resolve) => (finish = resolve)),
    }
    const { result } = setup(account)
    finishLibraryLoad()

    act(() => result.current.addFiles([FILE]))
    act(() => result.current.retryWorker())
    await act(async () => {
      finish(meWith(true))
      await Promise.resolve()
    })

    expect(result.current.error).toBe('Your import was interrupted. Add the files again.')
    expect(worker().posted.some((request) => request.type === 'addFiles')).toBe(false)
  })

  it('clears a library message when an import or a rebuild starts', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )
    act(() => result.current.deleteActivity('a1'))
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.libraryNotice).not.toBeNull()

    act(() => result.current.addFiles([FILE]))
    expect(result.current.libraryNotice).toBeNull()

    act(() => worker().reply({ type: 'state', state: STATE }))
    act(() => result.current.deleteActivity('a1'))
    act(() => worker().reply({ type: 'error', message: 'Network down' }))
    expect(result.current.libraryError).not.toBeNull()

    act(() => result.current.rebuildSavedActivities())
    expect(result.current.libraryError).toBeNull()
  })

  it("drops the last deletion's message when the sample is loaded or the analysis is cleared", () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const deleteOne = (result: { current: { deleteActivity: (id: string) => void } }) => {
      act(() => result.current.deleteActivity('run-1'))
      act(() => worker().reply({ type: 'state', state: STATE }))
    }
    const saved = {
      type: 'libraryActivities' as const,
      activities: [
        { id: 'run-1', name: 'Morning run', startMs, sport: 'run' as const, copy: SAVED_COPY },
      ],
    }
    const { result } = setup(SIGNED_OUT)
    act(() => worker().reply(saved))
    finishDeviceLoad()
    deleteOne(result)
    expect(result.current.libraryNotice).toBe(`Deleted Morning run (${formatDay(startMs)}).`)

    act(() => result.current.loadSample())
    expect(result.current.libraryNotice).toBeNull()
    act(() => worker().reply({ type: 'state', state: STATE }))

    act(() => worker().reply(saved))
    deleteOne(result)
    expect(result.current.libraryNotice).not.toBeNull()
    act(() => result.current.clear())
    expect(result.current.libraryNotice).toBeNull()
    expect(result.current.libraryError).toBeNull()
  })

  it('says the library is still loading when a delete is asked for before it has loaded', () => {
    const { result } = setup(SIGNED_IN_KEEP)

    act(() => result.current.deleteActivity('a1'))

    expect(result.current.libraryError).toBe(
      'Your library is still loading, so nothing was deleted. Try again in a moment.',
    )
    expect(worker().posted.some((request) => request.type === 'deleteActivity')).toBe(false)
  })

  it('says the account is still loading when a delete is asked for before the account is known', () => {
    const { result } = setup(LOADING)

    act(() => result.current.deleteActivity('a1'))

    expect(result.current.libraryError).toBe(
      'Your library is still loading, so nothing was deleted. Try again in a moment.',
    )
  })

  it('clears a library message when the session expires', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )
    act(() => result.current.deleteActivity('a1'))
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.libraryNotice).not.toBeNull()

    rerender({
      account: { status: 'signed-out', me: null, markExpired, sessionExpired: true },
      current: SETTINGS,
    })
    expect(result.current.libraryNotice).toBeNull()
    expect(result.current.libraryError).toBeNull()
  })

  it('empties the account list and its unreadable count when the session expires', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )
    act(() => worker().reply({ type: 'libraryUnreadable', count: 2 }))
    expect(result.current.savedActivities).toHaveLength(1)
    expect(result.current.libraryUnreadable).toBe(2)

    rerender({
      account: { status: 'signed-out', me: null, markExpired, sessionExpired: true },
      current: SETTINGS,
    })
    expect(result.current.savedActivities).toEqual([])
    expect(result.current.libraryUnreadable).toBe(0)
  })

  it('refuses a saved-activity rebuild made while the worker is stopped, and does not run it later', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))
    const stopped = worker()

    act(() => result.current.rebuildSavedActivities())
    expect(stopped.posted.some((request) => request.type === 'rebuildStale')).toBe(false)
    expect(result.current.error).toMatch(/did not run.*try again/)
  })

  it('reports a library delete as a library action, not as an import, and confirms it', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )

    act(() => result.current.deleteActivity('a1'))
    expect(result.current.libraryAction).toBe('deleting')
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBeNull()

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.libraryAction).toBeNull()
    expect(result.current.libraryNotice).toBe(`Deleted Morning run (${formatDay(startMs)}).`)
    expect(result.current.error).toBeNull()
  })

  it('reports a daily-limit delete failure in the library error, with no generic prefix', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )
    act(() => result.current.deleteActivity('a1'))
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.libraryError).toMatch(
      new RegExp(
        `^You have reached today's limit on deletions \\(${DAILY_LIMITS.activityDelete} per day\\)\\. `,
      ),
    )
    expect(result.current.libraryError).toMatch(RESET_AT_UTC_MIDNIGHT)
    expect(result.current.error).toBeNull()
    expect(result.current.libraryAction).toBeNull()
  })

  it('reports any other library delete failure in the library error, not the top-level alert', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run', copy: SAVED_COPY }],
      }),
    )
    act(() => result.current.deleteActivity('a1'))
    act(() => worker().reply({ type: 'error', message: 'Network down' }))

    expect(result.current.libraryError).toMatch(/Could not delete the activity.*Network down/)
    expect(result.current.error).toBeNull()
  })

  it('does not request a rebuild when file retention is unavailable', () => {
    const account = { status: 'signed-in' as const, me: meWith(true, false) }
    const { result } = setup(account)
    act(() => result.current.rebuildSavedActivities())

    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
    expect(result.current.rebuildNotice).toMatch(/cannot be read right now/i)
  })

  it('rehydrates the signed-in library after a fatal worker error', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    const stoppedWorker = worker()
    act(() => stoppedWorker.onerror?.({ message: 'worker lost' } as ErrorEvent))
    expect(worker()).not.toBe(stoppedWorker)
    expect(worker().posted).toContainEqual({
      type: 'loadServer',
      settings: SETTINGS,
      userId: USER_ID,
    })
    expect(result.current.error).toMatch(/saved library is reloading/i)
  })

  it('offers manual retry instead of restarting forever after repeated worker startup failures', () => {
    const { result } = setup(SIGNED_OUT)
    const initial = worker()
    act(() => initial.onerror?.({ message: 'module failed' } as ErrorEvent))
    const replacement = worker()
    act(() => replacement.onerror?.({ message: 'module failed again' } as ErrorEvent))

    expect(result.current.workerStopped).toBe(true)
    expect(worker()).toBe(replacement)
    expect(result.current.error).toMatch(/Analysis stopped unexpectedly.*add again/i)
    expect(replacement.terminated).toBe(true)
    act(() => result.current.addFiles([FILE]))
    expect(result.current.busy).toBe(false)

    act(() => result.current.retryWorker())
    expect(result.current.workerStopped).toBe(false)
    expect(worker()).not.toBe(replacement)
  })

  it('stops queued imports and rehydrates saved activities after a user stops analysis', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    const stopped = worker()
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.stop())

    expect(stopped.terminated).toBe(true)
    expect(result.current.busy).toBe(true) // The replacement is hydrating the saved library.
    expect(result.current.state).toEqual(STATE)
    expect(result.current.error).toMatch(/Stopped\. Add your files again/)
    expect(worker()).not.toBe(stopped)
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])
  })

  it('clears signed-out results after an unrecoverable worker failure', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 3 } }))
    const current = worker()
    act(() => current.onerror?.({ message: 'failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'failed again' } as ErrorEvent))
    expect(result.current.state).toEqual(STATE)
    expect(result.current.error).toMatch(/add again any files/i)
  })

  it('stays busy until the last of several outstanding requests is answered', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => result.current.clear())
    act(() => result.current.clear())
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.busy).toBe(true)
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.busy).toBe(false)
  })

  it('does not count a reply as outstanding when no request was sent', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.busy).toBe(false)
  })
})

describe('useAnalysis library messages', () => {
  it('shows how many stored activities could not be read, and clears the count when the library reloads', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => worker().reply({ type: 'libraryUnreadable', count: 2 }))
    expect(result.current.libraryUnreadable).toBe(2)

    act(() => result.current.retryLibrary())
    expect(result.current.libraryUnreadable).toBe(0)
  })

  it('states the daily read limit when the library cannot be loaded, with no generic prefix', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.libraryStatus).toBe('failed')
    expect(result.current.errorIssue).toBe('daily-limit')
    expect(result.current.error).toMatch(
      new RegExp(
        `^You have reached today's limit on library loads \\(${DAILY_LIMITS.read} per day\\)\\. `,
      ),
    )
    expect(result.current.error).toMatch(RESET_AT_UTC_MIDNIGHT)
  })

  it('states the daily read limit when a rebuild cannot list the library', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.rebuildSavedActivities())
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.errorIssue).toBe('daily-limit')
    expect(result.current.error).toMatch(
      new RegExp(
        `^You have reached today's limit on library loads \\(${DAILY_LIMITS.read} per day\\)\\. `,
      ),
    )
    expect(result.current.error).toMatch(RESET_AT_UTC_MIDNIGHT)
  })
})

describe('useAnalysis account export', () => {
  const EXPORT_REQUEST = {
    type: 'exportData',
    userId: USER_ID,
    account: { name: 'Ada', email: 'a@example.com' },
    profile: meWith(true).profile,
    measurements: [],
  }

  it('asks the worker for the export and resolves with its JSON', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()

    let exported: Promise<Blob> = Promise.resolve(new Blob())
    act(() => {
      exported = result.current.exportData()
    })
    expect(worker().posted.at(-1)).toEqual(EXPORT_REQUEST)
    const file = new Blob(['{"format":"rca-export"}'], { type: 'application/json' })
    act(() => worker().reply({ type: 'exportReady', file }))

    await expect(exported).resolves.toBe(file)
  })

  it('does not make an export busy, and keeps an import error on screen', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => {
      void result.current.exportData().catch(() => undefined)
    })
    expect(result.current.busy).toBe(false)

    act(() => worker().reply({ type: 'error', message: 'Offline', issue: 'network' }))
    expect(result.current.error).toBeNull()
  })

  it('rejects with the library daily-limit message when the listing is refused', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    let failure: unknown = null
    let exported: Promise<Blob> = Promise.resolve(new Blob())
    act(() => {
      exported = result.current.exportData()
    })
    exported.catch((error: unknown) => {
      failure = error
    })
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    await waitFor(() => expect(failure).toBeInstanceOf(Error))
    expect((failure as Error).message).toMatch(
      new RegExp(
        `^You have reached today's limit on library loads \\(${DAILY_LIMITS.read} per day\\)\\. `,
      ),
    )
    expect((failure as Error).message).toMatch(RESET_AT_UTC_MIDNIGHT)
  })

  it('rejects with the reason when the export fails for another cause', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    let exported: Promise<Blob> = Promise.resolve(new Blob())
    act(() => {
      exported = result.current.exportData()
    })
    act(() => worker().reply({ type: 'error', message: 'Offline', issue: 'network' }))

    await expect(exported).rejects.toThrow('Could not download your data. Offline')
  })

  it('is refused without a worker call when nobody is signed in', async () => {
    const { result } = setup(SIGNED_OUT)
    await expect(result.current.exportData()).rejects.toThrow('Sign in to download your data.')
    expect(worker().posted).toEqual([DEVICE_LOAD])
  })

  it('ends a pending export with a message when analysis is stopped', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    let exported: Promise<Blob> = Promise.resolve(new Blob())
    act(() => {
      exported = result.current.exportData()
    })
    act(() => result.current.stop())

    await expect(exported).rejects.toThrow(
      'The download was interrupted. Download your data again.',
    )
  })
})

describe('useAnalysis route shapes', () => {
  const SHAPE: RouteShape = {
    points: [
      [0, 0],
      [1, 1],
    ],
    aspect: 1,
  }

  it('asks the worker for a route under the signed-in user, and resolves with the shape', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()

    let loaded: Promise<RouteReply> | undefined
    act(() => {
      loaded = result.current.loadRoute('saved-1', false)
    })

    expect(worker().posted.at(-1)).toEqual({
      type: 'routeShape',
      id: 'saved-1',
      userId: USER_ID,
      fromOriginal: false,
    })
    act(() => worker().reply({ type: 'routeShape', route: SHAPE, original: false }))
    await expect(loaded).resolves.toEqual({ kind: 'shape', route: SHAPE })
  })

  it('asks for a signed-out route without a user, since it is read from this browser', async () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()

    act(() => {
      void result.current.loadRoute('run-1', false)
    })

    expect(worker().posted.at(-1)).toEqual({
      type: 'routeShape',
      id: 'run-1',
      fromOriginal: false,
    })
  })

  it('asks the worker to read the original only when asked to', async () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()

    act(() => {
      void result.current.loadRoute('saved-1', true)
    })

    expect(worker().posted.at(-1)).toMatchObject({ type: 'routeShape', fromOriginal: true })
  })

  it.each([
    ['in the kept original', { route: null, original: true }, { kind: 'original' }],
    ['in neither place', { route: null, original: false }, { kind: 'none' }],
  ])('reports a route %s', async (_, reply, expected) => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()

    let loaded: Promise<RouteReply> | undefined
    act(() => {
      loaded = result.current.loadRoute('saved-1', false)
    })
    act(() => worker().reply({ type: 'routeShape', ...reply }))

    await expect(loaded).resolves.toEqual(expected)
  })

  it('reports a failed read as failed, and shows no error', async () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()

    let loaded: Promise<RouteReply> | undefined
    act(() => {
      loaded = result.current.loadRoute('run-1', true)
    })
    act(() => worker().reply({ type: 'error', message: 'Too many downloads' }))

    await expect(loaded).resolves.toEqual({ kind: 'failed' })
    expect(result.current.error).toBeNull()
  })

  it('answers a route read made after the worker stopped for good as failed, with no error', async () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))
    const before = result.current.error

    let loaded: Promise<RouteReply> | undefined
    act(() => {
      loaded = result.current.loadRoute('run-1', false)
    })

    await expect(loaded).resolves.toEqual({ kind: 'failed' })
    expect(result.current.error).toBe(before)
  })

  it('drops a route reply that answers no route request, and keeps the import it would have answered', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => result.current.addFiles([FILE]))
    expect(result.current.busy).toBe(true)

    act(() => worker().reply({ type: 'routeShape', route: SHAPE, original: false }))

    expect(result.current.busy).toBe(true)
    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.busy).toBe(false)
    expect(result.current.state).toEqual(STATE)
  })

  it('tells the worker to forget the route shapes when the session expires', () => {
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    finishLibraryLoad()
    expect(result.current.error).toBeNull()

    rerender({
      account: { status: 'signed-out', me: null, markExpired, sessionExpired: true },
      current: SETTINGS,
    })

    expect(worker().posted).toContainEqual({ type: 'forgetRoutes' })
  })

  it('keeps an error already on screen, and is not busy while a route loads', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    act(() => worker().reply({ type: 'error', message: 'The import failed' }))

    act(() => {
      void result.current.loadRoute('run-1', false)
    })

    expect(result.current.error).toBe('The import failed')
    expect(result.current.busy).toBe(false)
  })
})

describe('a period pick is answered once the worker answers it', () => {
  it('calls the answer to a pick once with null when Stop drops the pick before the worker answers', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    const answered = vi.fn()

    act(() => result.current.setRange(42, answered))
    act(() => result.current.stop())

    expect(answered).toHaveBeenCalledTimes(1)
    expect(answered).toHaveBeenCalledWith(null)
  })

  it('calls the answer to a pick when the worker answers that pick, and not before', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()
    const answered = vi.fn()

    act(() => result.current.setRange(42, answered))
    expect(answered).not.toHaveBeenCalled()

    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, period: { ...STATE.period, choice: 42 } },
      }),
    )
    expect(answered).toHaveBeenCalledTimes(1)
  })
})

describe('a period pick is quiet', () => {
  it('does not make the page busy, so Stop and Share keep their state while the worker answers', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad()

    act(() => result.current.setRange(42))

    expect(result.current.busy).toBe(false)
  })
})

describe('a period, a clear, and the restore hint, in round 3', () => {
  it('does not resend a period chosen while the account loads, since the session keeps it', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.setRange(42))

    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })

    const posted = worker().posted
    const clearAt = posted.findIndex((request) => request.type === 'clear')
    expect(clearAt).toBeGreaterThan(-1)
    expect(posted.slice(clearAt + 1)).not.toContainEqual(
      expect.objectContaining({ type: 'setRange' }),
    )
  })

  it('keeps the restore hint when a signed-in visitor clears the session, since the library is kept', () => {
    localStorage.setItem('rca.kept.v1', '1')
    const { result } = setup(SIGNED_IN_KEEP)
    act(() =>
      worker().reply({
        type: 'state',
        state: {
          ...STATE,
          totalActivities: 2,
          library: [makeActivity(), makeActivity({ id: 'b' })],
        },
      }),
    )

    act(() => result.current.clear())
    act(() => worker().reply({ type: 'state', state: STATE }))

    expect(localStorage.getItem('rca.kept.v1')).toBe('1')
  })

  it('hints that a library is kept when it holds only runs at walking pace, which the analysis counts as none', () => {
    localStorage.removeItem('rca.kept.v1')
    setup(SIGNED_IN_KEEP)
    const hike = makeActivity({ id: 'hike', walkingPace: true })
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 0, walkingPaceRuns: 1, library: [hike] },
      }),
    )

    expect(localStorage.getItem('rca.kept.v1')).toBe('1')
  })

  it('does not show a provisional answer that arrives after a clear, before the clear is answered', () => {
    const { result } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.clear())

    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 1 },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )

    expect(result.current.state.totalActivities).toBe(0)
  })
})

describe('a rejected file dropped while the account loads', () => {
  const BAD = new File(['not a fit'], 'not-a-fit.fit')
  const REJECTED = [
    { fileName: 'not-a-fit.fit', reason: 'Not an activity file', code: 'not-activity' as const },
  ]

  it('still shows the rejected file once a kept library has loaded signed out', () => {
    localStorage.setItem('rca.kept.v1', '1')
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([BAD]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, rejected: REJECTED } }))

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 2 } }))
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 2, rejected: REJECTED },
      }),
    )

    expect(result.current.state.rejected).toEqual(REJECTED)
  })

  it('still shows the rejected file after a Start over that forgot the kept library', () => {
    localStorage.removeItem('rca.kept.v1')
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([BAD]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, rejected: REJECTED } }))

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => worker().reply({ type: 'state', state: STATE }))
    act(() => worker().reply({ type: 'state', state: { ...STATE, rejected: REJECTED } }))

    expect(result.current.state.rejected).toEqual(REJECTED)
  })

  it('still shows the rejected file with no kept library at all', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([BAD]))
    act(() => worker().reply({ type: 'state', state: { ...STATE, rejected: REJECTED } }))

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => worker().reply({ type: 'state', state: STATE }))
    act(() => worker().reply({ type: 'state', state: { ...STATE, rejected: REJECTED } }))

    expect(result.current.state.rejected).toEqual(REJECTED)
  })
})

describe('what an import is compared with, and the restore hint, in round 4', () => {
  /** Answers the first pending request, as the worker does in order. */
  function settle(state: SessionState = STATE) {
    act(() => worker().reply({ type: 'state', state }))
  }

  const F_ONLY = { tag: 'F-only' } as unknown as SessionState['result']
  const KEPT = { tag: 'kept library' } as unknown as SessionState['result']
  const KEPT_PLUS_F = { tag: 'kept + F' } as unknown as SessionState['result']
  const ACCOUNT = { tag: 'account library' } as unknown as SessionState['result']

  it('compares an import saved after the kept library loads with that library, not with the provisional analysis', () => {
    localStorage.setItem('rca.kept.v1', '1')
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    settle({ ...STATE, totalActivities: 1, result: F_ONLY })

    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() =>
      worker().reply({ type: 'state', state: { ...STATE, totalActivities: 3, result: KEPT } }),
    )
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 4, result: KEPT_PLUS_F },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )

    expect(result.current.importChange?.before).toBe(KEPT)
  })

  it('compares an import saved after the account library loads with that library', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    settle({ ...STATE, totalActivities: 1, result: F_ONLY })

    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    settle()
    finishLibraryLoad({ ...STATE, totalActivities: 3, result: ACCOUNT })
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 3, result: KEPT_PLUS_F },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )

    expect(result.current.importChange?.before).toBe(ACCOUNT)
  })

  it('forgets the restore hint when the last kept activity is deleted', () => {
    localStorage.setItem('rca.kept.v1', '1')
    const { result } = setup(SIGNED_OUT)
    reportKept(1)
    finishDeviceLoad({ ...STATE, totalActivities: 1 })

    act(() => result.current.deleteActivity('run-0'))
    act(() => worker().reply({ type: 'libraryActivities', activities: [] }))
    act(() => worker().reply({ type: 'state', state: { ...STATE, totalActivities: 0 } }))

    expect(localStorage.getItem('rca.kept.v1')).toBeNull()
  })

  it('keeps the restore hint while a sample is on screen, since the kept library is still there', () => {
    localStorage.setItem('rca.kept.v1', '1')
    setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, isSample: true, totalActivities: 0 })

    expect(localStorage.getItem('rca.kept.v1')).toBe('1')
  })

  it('does not send a period chosen before a start over once the account signs in', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.setRange(42))
    act(() => result.current.clear())
    act(() => result.current.addFiles([FILE]))

    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })

    const posted = worker().posted
    const afterClear = posted.slice(posted.findIndex((request) => request.type === 'clear') + 1)
    expect(afterClear).not.toContainEqual(expect.objectContaining({ type: 'setRange', choice: 42 }))
  })
})

describe('round 5: baselines, errors, and Start over during a load', () => {
  function settle(state: SessionState = STATE) {
    act(() => worker().reply({ type: 'state', state }))
  }
  const LIB_A = { tag: 'library A' } as unknown as SessionState['result']
  const LIB_A2 = { tag: 'library A after stop' } as unknown as SessionState['result']
  const LIB_B = { tag: 'library B' } as unknown as SessionState['result']
  const KEPT = { tag: 'kept library' } as unknown as SessionState['result']
  const RESULT_NEW = { tag: 'after import' } as unknown as SessionState['result']

  /** A signed-in account whose profile writes are still pending until `release` is called. */
  function gatedAccount(me: Me) {
    let release: (value: Me | null) => void = () => undefined
    const gate = new Promise<Me | null>((resolve) => {
      release = resolve
    })
    const account: Account = { status: 'signed-in', me, flushProfileWrites: () => gate }
    return { account, release: (value: Me | null) => release(value) }
  }

  it('compares an import abandoned by an account switch with the next account, not the abandoned one', async () => {
    const gated = gatedAccount(meWith(true))
    const { result, rerender } = setup(gated.account)
    act(() => result.current.addFiles([FILE]))
    finishLibraryLoad({ ...STATE, totalActivities: 3, result: LIB_A })
    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    await act(async () => gated.release(meWith(true)))
    finishLibraryLoad({ ...STATE, totalActivities: 2, result: LIB_B })
    act(() => result.current.addFiles([FILE]))
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 3, result: RESULT_NEW },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before).toBe(LIB_B)
  })

  it('compares an import made after Stop with the library as it is then, not the one a pending write held', async () => {
    const gated = gatedAccount(meWith(true))
    const { result } = setup(gated.account)
    act(() => result.current.addFiles([FILE]))
    finishLibraryLoad({ ...STATE, totalActivities: 3, result: LIB_A })
    act(() => result.current.stop())
    await act(async () => gated.release(meWith(true)))
    finishLibraryLoad({ ...STATE, totalActivities: 3, result: LIB_A2 })
    await act(async () => {
      result.current.addFiles([FILE])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 4, result: RESULT_NEW },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before).toBe(LIB_A2)
  })

  it('compares each drop waiting for the device library with that library', () => {
    localStorage.setItem('rca.kept.v1', '1')
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.addFiles([FILE]))
    settle()
    settle()
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() =>
      worker().reply({ type: 'state', state: { ...STATE, totalActivities: 3, result: KEPT } }),
    )
    expect(worker().posted.filter((request) => request.type === 'addFiles')).toHaveLength(4)
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 4, result: RESULT_NEW },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before).toBe(KEPT)
  })

  it('drops the imports waiting for a device library that fails to load, and stops waiting', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    settle()
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(result.current.waitingReason).toBe('Checking your saved results…')

    act(() => worker().reply({ type: 'error', message: 'Device library down' }))

    expect(result.current.busy).toBe(false)
    expect(result.current.waitingReason).toBeNull()
    expect(result.current.error).toMatch(/kept results could not be loaded in this browser/)
    const posted = worker().posted
    const afterLoad = posted.slice(posted.findIndex((request) => request.type === 'loadDevice') + 1)
    expect(afterLoad.some((request) => request.type === 'addFiles')).toBe(false)
  })

  it('does not save the imports that waited for the device library when Start over runs during the load', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    settle()
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => result.current.clear())
    settle()
    settle()
    const posted = worker().posted
    const afterClear = posted.slice(posted.findIndex((request) => request.type === 'clear') + 1)
    expect(afterClear.some((request) => request.type === 'addFiles')).toBe(false)
    expect(result.current.busy).toBe(false)
  })

  it('does not save the imports that waited for the signed-in library when Start over runs during the load', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.clear())
    settle()
    settle()
    expect(worker().posted.some((request) => request.type === 'addFiles')).toBe(false)
    expect(result.current.busy).toBe(false)
  })

  it('does not send an import whose profile writes land after a Start over', async () => {
    const gated = gatedAccount(meWith(true))
    const { result } = setup(gated.account)
    finishLibraryLoad()
    act(() => result.current.addFiles([FILE]))
    act(() => result.current.clear())

    await act(async () => gated.release(meWith(true)))

    const posted = worker().posted
    const afterClear = posted.slice(posted.findIndex((request) => request.type === 'clear') + 1)
    expect(afterClear.some((request) => request.type === 'addFiles' && request.sync !== null)).toBe(
      false,
    )
  })

  it('compares an import dropped right after a Start over with nothing, not the results it cleared', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, totalActivities: 3, result: LIB_A })
    act(() => result.current.clear())
    act(() => result.current.addFiles([FILE]))
    settle({ ...STATE, totalActivities: 0, result: null })
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 1, result: RESULT_NEW },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before ?? null).toBeNull()
  })

  it('compares each import with the analysis on screen when it was sent', () => {
    const { result } = setup(SIGNED_OUT)
    finishDeviceLoad({ ...STATE, totalActivities: 3, result: LIB_A })
    act(() => result.current.addFiles([FILE]))
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 4, result: LIB_B },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before).toBe(LIB_A)

    act(() => result.current.addFiles([FILE]))
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 5, result: RESULT_NEW },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before).toBe(LIB_B)
  })

  it('sends a signed-in import with no body mass on the placeholder, never on null', async () => {
    const me = meWith(true)
    const noWeight: Me = { ...me, profile: { ...me.profile, massKg: null } }
    const { result } = setup({ status: 'signed-in', me: noWeight })
    finishLibraryLoad({ ...STATE, totalActivities: 1, result: LIB_A })
    await act(async () => {
      result.current.addFiles([FILE])
      await Promise.resolve()
    })
    const posted = worker().posted
    const addFiles = posted.find((request) => request.type === 'addFiles')
    expect(addFiles && 'settings' in addFiles ? addFiles.settings.massKg : null).toBe(75)
  })
})

describe('round 7: the baseline when an import is sent, and a library read a Start over overtakes', () => {
  const LIB_A = { tag: 'library A' } as unknown as SessionState['result']
  const LIB_B = { tag: 'library B' } as unknown as SessionState['result']
  const KEPT = { tag: 'kept library' } as unknown as SessionState['result']
  const RESULT_NEW = { tag: 'after import' } as unknown as SessionState['result']

  it('compares an import waiting on a profile write with the result reported when it is sent', async () => {
    let waiting = false
    let releaseWrite: (value: Me | null) => void = () => undefined
    const account: Account = {
      status: 'signed-in',
      me: meWith(true),
      flushProfileWrites: () => {
        if (!waiting) return Promise.resolve(meWith(true))
        return new Promise<Me | null>((resolve) => {
          releaseWrite = resolve
        })
      },
    }
    const { result } = setup(account)
    finishLibraryLoad({ ...STATE, totalActivities: 3, result: LIB_A })
    await act(async () => {
      result.current.addFiles([FILE])
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    waiting = true
    act(() => result.current.addFiles([FILE]))
    await act(async () => {
      // File A's reply moves the result, and the profile write B waits on lands in the same turn.
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 4, result: LIB_B },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      })
      releaseWrite(meWith(true))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    act(() =>
      worker().reply({
        type: 'state',
        state: { ...STATE, totalActivities: 5, result: RESULT_NEW },
        outcome: { activities: 1, rejected: 0, duplicates: [] },
      }),
    )
    expect(result.current.importChange?.before).toBe(LIB_B)
  })

  it('does not show the kept results a device load answers after a Start over, and ends the restoring state at once', () => {
    localStorage.setItem('rca.kept.v1', '1')
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.clear())
    expect(result.current.restoring).toBe(false)
    act(() =>
      worker().reply({ type: 'state', state: { ...STATE, totalActivities: 3, result: KEPT } }),
    )
    expect(result.current.state.result).toBeNull()
  })

  it('ignores a library read a Start over overtook, and still saves an import made after the clear to that library', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.clear())
    act(() => result.current.addFiles([FILE]))
    act(() =>
      worker().reply({ type: 'state', state: { ...STATE, totalActivities: 3, result: LIB_A } }),
    )
    expect(result.current.state.result).toBeNull()
    expect(
      worker().posted.some((request) => request.type === 'addFiles' && request.sync !== null),
    ).toBe(true)
  })
  it('says an import was cancelled when the account changes while it waits', () => {
    const account: Account = {
      status: 'signed-in',
      me: meWith(true),
      flushProfileWrites: () => new Promise<Me | null>(() => undefined),
    }
    const { result, rerender } = setup(account)
    act(() => result.current.addFiles([FILE]))
    rerender({ account: { status: 'signed-in', me: meAs('u2') }, current: SETTINGS })
    expect(result.current.error).toBe(
      'An import was cancelled because the account changed. Select the files again.',
    )
  })
})

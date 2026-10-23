// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { DAILY_LIMITS } from '@rca/contract'
import type { Me } from '@rca/contract'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'
import type { AccountStatus } from './useAccount'
import { useAnalysis } from './useAnalysis'

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

function meWith(keepFiles: boolean, fileRetentionAvailable?: boolean): Me {
  const me: Me = {
    user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
    profile: { massKg: 75, bikeMassKg: 9, units: 'metric', keepFiles, updatedAt: 1000 },
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
}

const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN_KEEP: Account = { status: 'signed-in', me: meWith(true) }
const SIGNED_IN_NO_KEEP: Account = { status: 'signed-in', me: meWith(false) }

function setup(initial: Account = LOADING, settings: AthleteSettings = SETTINGS) {
  return renderHook(
    ({ account, current }: { account: Account; current: AthleteSettings }) =>
      useAnalysis(current, account),
    { initialProps: { account: initial, current: settings } },
  )
}

/** Replies to the account's library load, so imports are sent to the library. */
function finishLibraryLoad(state: SessionState = STATE) {
  act(() => worker().reply({ type: 'state', state }))
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
  rangeDays: null,
  syncIssues: [],
  outdatedActivities: 0,
  incompatibleActivities: 0,
  hiddenDuplicates: 0,
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

  it('loads the stored activities into the active worker under StrictMode', () => {
    renderHook(
      ({ account, current }: { account: Account; current: AthleteSettings }) =>
        useAnalysis(current, account),
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
    expect(worker().posted).toEqual([])
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
    expect(worker().posted).toEqual([])
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
    expect(result.current.error).toBeNull()
  })

  it('does not clear the library when the first account lookup finds nobody signed in', () => {
    const { rerender } = setup(LOADING)
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([])
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
        /Retry saving your settings, then re-import these files/,
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
    expect(result.current.error).toMatch(/Analysis stopped/)
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

  it('defers imports while the account is loading, then sends them without sync when signed out', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    expect(worker().posted).toEqual([])
    rerender({ account: SIGNED_OUT, current: SETTINGS })

    expect(worker().posted).toEqual([
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null },
    ])
  })

  it('hydrates before syncing imports dropped while the account is loading', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    expect(worker().posted).toEqual([])

    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS, userId: USER_ID }])

    // The import waits for the library: a failed load must not be followed by an import.
    finishLibraryLoad()
    expect(worker().posted).toEqual([
      { type: 'loadServer', settings: SETTINGS, userId: USER_ID },
      {
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: { keepFiles: true, userId: USER_ID },
      },
    ])
  })

  it('sends no sync option when the account is unavailable', () => {
    const { result } = setup({ status: 'unavailable', me: null })
    act(() => result.current.addFiles([FILE]))
    expect(worker().posted).toEqual([
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null },
    ])
  })

  it('does not post an import with no files', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([]))
    expect(worker().posted).toEqual([])
  })
})

describe('useAnalysis requests', () => {
  it('posts sample, range and clear requests with the current settings', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.loadSample())
    act(() => result.current.setRange(42))
    act(() => result.current.clear())

    expect(worker().posted).toEqual([
      { type: 'loadSample', settings: SETTINGS },
      { type: 'setRange', rangeDays: 42, settings: SETTINGS },
      { type: 'clear' },
    ])
  })

  it('posts new settings only when the body or bike mass changes', () => {
    const { rerender } = setup(SIGNED_OUT, SETTINGS)
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([])

    const changed = { massKg: 80, bikeMassKg: 9 }
    rerender({ account: SIGNED_OUT, current: changed })
    expect(worker().posted).toEqual([{ type: 'setSettings', settings: changed }])
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
    expect(result.current.waitingReason).toBe('Waiting for your library to load')
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
    expect(result.current.waitingReason).toBe('Waiting for your library to load')

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

  it('refuses a signed-out import made while the worker is stopped, and does not run it after a restart', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))
    const stopped = worker()

    act(() => result.current.addFiles([FILE]))
    expect(stopped.posted).toEqual([])
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toMatch(/did not run.*try again/)

    act(() => result.current.retryWorker())
    expect(worker()).not.toBe(stopped)
    expect(worker().posted).toEqual([])
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
    expect(result.current.progress).toBe(3)
    expect(result.current.uploading).toBe(2)

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.progress).toBeNull()
    expect(result.current.uploading).toBeNull()
  })

  it('reports no uploads for a progress message that carries none', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'progress', filesRead: 1 }))
    expect(result.current.progress).toBe(1)
    expect(result.current.uploading).toBeNull()
  })

  it('shows a worker error message and stops being busy', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.clear())
    act(() => worker().reply({ type: 'error', message: 'Disk full' }))
    expect(result.current.error).toBe('Disk full')
    expect(result.current.busy).toBe(false)
  })

  it('reports a worker crash with its message, or a fallback when it has none', () => {
    const { result } = setup(SIGNED_OUT)
    const stoppedWorker = worker()
    act(() => result.current.clear())
    act(() => stoppedWorker.onerror?.({ message: 'Script failed' } as ErrorEvent))
    expect(result.current.error).toMatch(/worker stopped.*re-import/i)
    expect(result.current.busy).toBe(false)
    expect(stoppedWorker.terminated).toBe(true)
    expect(worker()).not.toBe(stoppedWorker)

    const retryingWorker = worker()
    act(() => result.current.clear())
    act(() => worker().onerror?.({ message: '' } as ErrorEvent))
    expect(result.current.error).toMatch(/worker stopped.*re-import/i)
    expect(result.current.workerStopped).toBe(true)
    expect(worker()).toBe(retryingWorker)
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
    expect(result.current.rebuildNotice).toMatch(/re-import those original files/)
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
    expect(result.current.rebuildNotice).toMatch(/re-import those original files/)
    expect(result.current.rebuildNotice).toMatch(/2 could not be rebuilt; try again/)
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
      `Rebuilt 2 saved activities. 3 activities were not rebuilt because the daily download limit (50 per day) was reached. Try again after ${new Date(resetsAt).toLocaleString()}.`,
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
      'Rebuilt 0 saved activities. 1 activity was not rebuilt. The server asked us to slow down; try again in a minute.',
    )
  })

  it('does not promise a reset time for a limit whose reset is unknown', () => {
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
      /1 activity was not rebuilt because the daily download limit.*Try again later\./,
    )
    expect(result.current.rebuildNotice).not.toMatch(/server is available/)
  })

  it('states the daily limit and its reset for an import, with no generic error prefix', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.errorIssue).toBe('daily-limit')
    expect(result.current.error).toBe(
      'You have reached the daily limit for this account. The limit resets at 00:00 UTC.',
    )
  })

  it('keeps the worker-stopped message when a worker stops while imports are held', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    act(() => worker().onerror?.({ message: 'module failed' } as ErrorEvent))
    act(() => worker().onerror?.({ message: 'module failed again' } as ErrorEvent))

    expect(result.current.workerStopped).toBe(true)
    expect(result.current.error).toMatch(/worker stopped.*Restart analysis/i)
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
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run' }],
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

  it('clears a library message when the session expires', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const markExpired = vi.fn()
    const { result, rerender } = setup({ ...SIGNED_IN_KEEP, markExpired })
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run' }],
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
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run' }],
      }),
    )

    act(() => result.current.deleteActivity('a1'))
    expect(result.current.libraryAction).toBe('deleting')
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBeNull()

    act(() => worker().reply({ type: 'state', state: STATE }))
    expect(result.current.libraryAction).toBeNull()
    expect(result.current.libraryNotice).toBe(
      `Deleted Morning run (${new Date(startMs).toLocaleDateString()}).`,
    )
    expect(result.current.error).toBeNull()
  })

  it('reports a daily-limit delete failure in the library error, with no generic prefix', () => {
    const startMs = Date.UTC(2026, 9, 20, 12)
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() =>
      worker().reply({
        type: 'libraryActivities',
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run' }],
      }),
    )
    act(() => result.current.deleteActivity('a1'))
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.libraryError).toBe(
      'You can delete up to 50 activities per day. The limit resets at 00:00 UTC.',
    )
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
        activities: [{ id: 'a1', name: 'Morning run', startMs, sport: 'run' }],
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
    expect(result.current.rebuildNotice).toMatch(/cannot be accessed on this deployment/i)
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
    expect(result.current.error).toMatch(/worker stopped.*re-import/i)
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
    expect(result.current.error).toMatch(/analysis stopped.*re-import/i)
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
    expect(result.current.error).toMatch(/re-import your files/i)
  })

  it('stays busy until the last of several outstanding requests is answered', () => {
    const { result } = setup(SIGNED_OUT)
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
    expect(result.current.error).toBe(
      `You have reached today's limit for loading your library (${DAILY_LIMITS.read} per day). It resets at 00:00 UTC.`,
    )
  })

  it('states the daily read limit when a rebuild cannot list the library', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    finishLibraryLoad()
    act(() => result.current.rebuildSavedActivities())
    act(() => worker().reply({ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }))

    expect(result.current.errorIssue).toBe('daily-limit')
    expect(result.current.error).toBe(
      `You have reached today's limit for loading your library (${DAILY_LIMITS.read} per day). It resets at 00:00 UTC.`,
    )
  })
})

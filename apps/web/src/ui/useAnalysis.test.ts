// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import type { ReactNode } from 'react'
import type { Me } from '@rca/contract'
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
}

const LOADING: Account = { status: 'loading', me: null }
const SIGNED_OUT: Account = { status: 'signed-out', me: null }
const SIGNED_IN_KEEP: Account = { status: 'signed-in', me: meWith(true) }

function setup(initial: Account = LOADING, settings: AthleteSettings = SETTINGS) {
  return renderHook(
    ({ account, current }: { account: Account; current: AthleteSettings }) =>
      useAnalysis(current, account),
    { initialProps: { account: initial, current: settings } },
  )
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
  syncFailures: 0,
  outdatedActivities: 0,
  incompatibleActivities: 0,
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

  it('keeps syncing digests without uploading files when file retention is unavailable', () => {
    const account = { status: 'signed-in' as const, me: meWith(true, false) }
    const { result } = setup(account)

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
  it('tracks storage allowance failures and resets the notice state for a new import or clear', () => {
    const { result } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    const firstImport = worker()
    act(() => firstImport.reply({ type: 'storageBudgetExceeded' }))
    expect(result.current.storageBudgetExceeded).toBe(true)
    act(() => firstImport.reply({ type: 'state', state: { ...STATE, syncFailures: 1 } }))
    expect(result.current.storageBudgetExceeded).toBe(true)

    act(() => result.current.addFiles([FILE]))
    expect(result.current.storageBudgetExceeded).toBe(false)
    act(() => worker().reply({ type: 'state', state: STATE }))
    act(() => result.current.addFiles([FILE]))
    act(() => worker().reply({ type: 'storageBudgetExceeded' }))
    expect(result.current.storageBudgetExceeded).toBe(true)
    act(() => result.current.clear())
    expect(result.current.storageBudgetExceeded).toBe(false)
  })

  it('ignores a storage allowance message from a prior account worker', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    const workerA = worker()
    act(() => result.current.addFiles([FILE]))
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => workerA.reply({ type: 'storageBudgetExceeded' }))
    expect(result.current.storageBudgetExceeded).toBe(false)
  })

  it('reports busy until the reply arrives and exposes the state it carries', () => {
    const { result } = setup(SIGNED_OUT)
    act(() => result.current.loadSample())
    expect(result.current.busy).toBe(true)

    act(() =>
      worker().reply({ type: 'state', state: { ...STATE, syncFailures: 2, totalActivities: 5 } }),
    )
    expect(result.current.busy).toBe(false)
    expect(result.current.state.syncFailures).toBe(2)
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
      }),
    )
    expect(result.current.state.outdatedActivities).toBe(2)
    expect(result.current.rebuildNotice).toMatch(/re-import those original FIT files/)
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
      }),
    )
    expect(result.current.rebuildNotice).toMatch(/re-import those original FIT files/)
    expect(result.current.rebuildNotice).toMatch(/2 could not be rebuilt; try again/)
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

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
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

function meWith(keepFiles: boolean): Me {
  return {
    user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
    profile: { massKg: 75, bikeMassKg: 9, units: 'metric', keepFiles, updatedAt: 1000 },
  }
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

    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS }])
  })

  it('loads the stored activities when signing in after the first lookup found nobody', () => {
    const { rerender } = setup(SIGNED_OUT)
    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS }])
  })

  it('loads the stored activities when the page opens already signed in', () => {
    setup(SIGNED_IN_KEEP)
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS }])
  })

  it('clears the library when the user signs out', () => {
    const { rerender } = setup(LOADING)
    rerender({ account: SIGNED_IN_KEEP, current: SETTINGS })
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS }, { type: 'clear' }])
  })

  it('does not clear the library when the first account lookup finds nobody signed in', () => {
    const { rerender } = setup(LOADING)
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    expect(worker().posted).toEqual([])
  })

  it('does not clear the library when the account becomes unavailable', () => {
    const { rerender } = setup(SIGNED_IN_KEEP)
    rerender({ account: { status: 'unavailable', me: null }, current: SETTINGS })
    expect(worker().posted).toEqual([{ type: 'loadServer', settings: SETTINGS }])
  })

  it('sends the keep-files setting with each import while signed in', () => {
    const { result, rerender } = setup(SIGNED_IN_KEEP)
    act(() => result.current.addFiles([FILE]))
    rerender({ account: { status: 'signed-in', me: meWith(false) }, current: SETTINGS })
    act(() => result.current.addFiles([FILE]))

    expect(worker().posted).toEqual([
      { type: 'loadServer', settings: SETTINGS },
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: { keepFiles: true } },
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: { keepFiles: false } },
    ])
  })

  it('sends no sync option when signed out or while the account is loading', () => {
    const { result, rerender } = setup(LOADING)
    act(() => result.current.addFiles([FILE]))
    rerender({ account: SIGNED_OUT, current: SETTINGS })
    act(() => result.current.addFiles([FILE]))

    expect(worker().posted).toEqual([
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null },
      { type: 'addFiles', files: [FILE], settings: SETTINGS, sync: null },
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
    act(() => result.current.clear())
    act(() => worker().onerror?.({ message: 'Script failed' } as ErrorEvent))
    expect(result.current.error).toBe('Script failed')
    expect(result.current.busy).toBe(false)

    act(() => result.current.clear())
    act(() => worker().onerror?.({ message: '' } as ErrorEvent))
    expect(result.current.error).toBe('The analysis worker failed')
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

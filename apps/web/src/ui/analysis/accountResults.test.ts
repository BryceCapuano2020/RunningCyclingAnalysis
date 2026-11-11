// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { snapshotContentHash } from '@rca/core/stateSnapshot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../api/apiError'
import type { StateRead } from '../../api/state'
import * as api from '../../api/state'
import { resultState, snapshotAt } from '../../test/stateCopyKit'
import {
  BUSY_RETRY_MS,
  INDEX_SETTLE_MS,
  POLL_MS,
  busyWaitMs,
  useAccountResults,
} from './accountResults'
import * as staleBuild from './staleBuild'
import { tellOtherTabs } from '../tabSync'

vi.mock('../../api/state', () => ({ readServerState: vi.fn() }))
// The copy kept on the device is not what these read: no IndexedDB runs beside the fake clock.
vi.mock('../../worker/stateStore', () => ({
  readSnapshot: async () => null,
  writeSnapshot: async () => true,
}))
vi.mock('./staleBuild', () => ({ reloadOnceForNewBuild: vi.fn() }))

const read = vi.mocked(api.readServerState)
const snapshot = (version = 0) => ({
  ...snapshotAt(Date.now(), 'UTC', resultState()),
  libraryVersion: version,
})
const answer = (extra: Partial<StateRead & { kind: 'snapshot' }> = {}): StateRead => ({
  kind: 'snapshot',
  snapshot: snapshot(),
  nowMs: null,
  current: true,
  ...extra,
})

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function mount(props: { quiet?: boolean; behind?: () => void } = {}) {
  return renderHook(
    ({ quiet }: { quiet: boolean }) =>
      useAccountResults('u1', false, quiet, props.behind ?? (() => undefined)),
    { initialProps: { quiet: props.quiet ?? true } },
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  read.mockReset()
  vi.mocked(staleBuild.reloadOnceForNewBuild).mockReset()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('asking again while the server computes', () => {
  it('doubles the wait with each answer that is no better, up to the poll', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(busyWaitMs)).toEqual([
      BUSY_RETRY_MS,
      2 * BUSY_RETRY_MS,
      4 * BUSY_RETRY_MS,
      8 * BUSY_RETRY_MS,
      16 * BUSY_RETRY_MS,
      POLL_MS,
      POLL_MS,
    ])
  })

  it('backs off on answers that stay stale, so a row the queue is slow to compute is not asked for every few seconds', async () => {
    read.mockResolvedValue(answer({ current: false }))
    mount()
    await flush()
    expect(read).toHaveBeenCalledTimes(1)
    await advance(BUSY_RETRY_MS)
    expect(read).toHaveBeenCalledTimes(2)
    // The second wait is twice as long: nothing at the old interval.
    await advance(BUSY_RETRY_MS)
    expect(read).toHaveBeenCalledTimes(2)
    await advance(BUSY_RETRY_MS)
    expect(read).toHaveBeenCalledTimes(3)
    // Ten minutes of it is the poll's one ask a minute, and the backed-off retries between: not one every 3 s (200).
    await advance(600_000)
    expect(read.mock.calls.length).toBeLessThanOrEqual(25)
  })

  it('does not take a burst of changes for a row that stays stale: the wait starts again from the short one', async () => {
    read.mockResolvedValue(answer({ current: false }))
    mount()
    await flush()
    // An import ends: the page asks again for each reply it gets, and each answer is the stored snapshot.
    for (let i = 0; i < 8; i++) {
      act(() => tellOtherTabs({ type: 'lifts' }))
      await flush()
    }
    const asked = read.mock.calls.length
    await advance(BUSY_RETRY_MS)
    expect(read.mock.calls.length).toBe(asked + 1)
  })

  it('starts again from the short wait once an answer is current', async () => {
    read.mockResolvedValueOnce(answer({ current: false }))
    read.mockResolvedValueOnce(answer({ current: false }))
    read.mockResolvedValue(answer())
    mount()
    await flush()
    await advance(BUSY_RETRY_MS)
    await advance(2 * BUSY_RETRY_MS)
    expect(read).toHaveBeenCalledTimes(3)
    await advance(BUSY_RETRY_MS)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('does not ask while the tab is hidden, and asks as it comes back', async () => {
    read.mockResolvedValue(answer({ current: false }))
    mount()
    await flush()
    setVisibility('hidden')
    await advance(10 * POLL_MS)
    expect(read).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await flush()
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('one ask at a time', () => {
  it('runs one read in flight and one queued, however many changes arrive meanwhile', async () => {
    let release: (value: StateRead) => void = () => undefined
    read.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    read.mockResolvedValue(answer())
    mount()
    await flush()
    expect(read).toHaveBeenCalledTimes(1)
    act(() => {
      for (let i = 0; i < 5; i++) tellOtherTabs({ type: 'lifts' })
    })
    await flush()
    expect(read).toHaveBeenCalledTimes(1)
    await act(async () => release(answer()))
    await flush()
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('a snapshot of another build', () => {
  const other = () => ({ ...snapshot(), modelRevision: -1 })

  it('keeps its tag, so a reload that is refused costs a 304 and not a body on each ask', async () => {
    const refused = other()
    read.mockResolvedValue(answer({ snapshot: refused }))
    mount()
    await flush()
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    expect(read).toHaveBeenCalledTimes(2)
    expect(await snapshotContentHash(read.mock.calls[1]![1]!)).toBe(
      await snapshotContentHash(refused),
    )
  })

  it('does not reload in the middle of the tab’s own work, only once it has none', async () => {
    read.mockResolvedValue(answer({ snapshot: other() }))
    const view = mount({ quiet: false })
    await flush()
    expect(staleBuild.reloadOnceForNewBuild).not.toHaveBeenCalled()
    view.rerender({ quiet: true })
    await flush()
    expect(staleBuild.reloadOnceForNewBuild).toHaveBeenCalledTimes(1)
  })

  it('does not reload a tab that is out of view while it has work, since it may be mid-import', async () => {
    setVisibility('hidden')
    read.mockResolvedValue(answer({ snapshot: other() }))
    const view = mount({ quiet: false })
    await flush()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await flush()
    expect(staleBuild.reloadOnceForNewBuild).not.toHaveBeenCalled()
    view.rerender({ quiet: true })
    await flush()
    expect(staleBuild.reloadOnceForNewBuild).toHaveBeenCalledTimes(1)
  })
})

describe('the index of the library', () => {
  it('is read again when the server’s library moves past the version it was listed at, and not for this tab’s own', async () => {
    const behind = vi.fn()
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(5) }))
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(5) }))
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(6) }))
    const view = mount({ behind })
    await flush()
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    expect(behind).not.toHaveBeenCalled()
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    await advance(INDEX_SETTLE_MS)
    expect(behind).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('takes the next snapshot as the version of an index this tab has just changed itself', async () => {
    const behind = vi.fn()
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(5) }))
    read.mockResolvedValue(answer({ snapshot: snapshot(6) }))
    const view = renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    // This tab's import ended: the index is as current as the snapshot that follows it.
    act(() => view.result.current.indexListed())
    act(() => tellOtherTabs({ type: 'library', scope: 'account' }))
    await flush()
    expect(behind).not.toHaveBeenCalled()
  })

  it('reads the index again for another device’s import after the tab opened on a 304: the list’s version is the baseline', async () => {
    const behind = vi.fn()
    const view = renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    // The library was listed at version 5 (the loadServer reply says so); the snapshot on open was a 304, which names none.
    act(() => view.result.current.indexListed(5))
    read.mockResolvedValueOnce({ kind: 'unchanged', nowMs: null, version: null, current: true })
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    expect(behind).not.toHaveBeenCalled()
    // An import on the phone moves the library to 6; the next 200 shows it.
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(6) }))
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    await advance(INDEX_SETTLE_MS)
    expect(behind).toHaveBeenCalledTimes(1)
  })

  it('takes the version a 304 names as the held copy’s: a version bump that moved no figure still reaches the index gate', async () => {
    const behind = vi.fn()
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(5) }))
    const view = renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    expect(view.result.current.results?.snapshot.libraryVersion).toBe(5)
    // Another device's import changed no figure: the snapshot is the same (a 304), and the server says it covers version 6.
    read.mockResolvedValueOnce({ kind: 'unchanged', nowMs: null, version: 6, current: true })
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    expect(view.result.current.results?.snapshot.libraryVersion).toBe(6)
    await advance(INDEX_SETTLE_MS)
    expect(behind).toHaveBeenCalledTimes(1)
  })

  it('reads the index again once when another device’s change is current: listed at 1, stored at 2, current at 2', async () => {
    const behind = vi.fn()
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(2), current: false }))
    const view = renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    act(() => view.result.current.indexListed(1))
    // The stored snapshot covers 2 but is not current: it says nothing yet. The current one at 2 does.
    expect(behind).not.toHaveBeenCalled()
    read.mockResolvedValue(answer({ snapshot: snapshot(2) }))
    await advance(BUSY_RETRY_MS)
    await advance(INDEX_SETTLE_MS)
    expect(behind).toHaveBeenCalledTimes(1)
    await advance(POLL_MS)
    expect(behind).toHaveBeenCalledTimes(1)
  })

  it('does not take the baseline from a read that began before this tab changed the index itself', async () => {
    const behind = vi.fn()
    // A read of the library as it was is still in flight when this tab's own import ends and notes the index current.
    let late: (value: StateRead) => void = () => undefined
    read.mockImplementationOnce(() => new Promise<StateRead>((done) => (late = done)))
    const view = renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    act(() => view.result.current.indexListed())
    await act(async () => late(answer({ snapshot: snapshot(1) })))
    // The next read covers the import (version 2): the library moved by this tab's own work, not another device's.
    read.mockResolvedValue(answer({ snapshot: snapshot(2) }))
    act(() => tellOtherTabs({ type: 'lifts' }))
    await flush()
    expect(behind).not.toHaveBeenCalled()
  })

  it('does not read the index again for a version this tab’s profile, settings or dated settings moved: they change figures, not the list', async () => {
    const behind = vi.fn()
    const view = renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    act(() => view.result.current.indexListed(2))
    for (const [index, type] of (['profile', 'measurements', 'settings'] as const).entries()) {
      read.mockResolvedValue(answer({ snapshot: snapshot(3 + index) }))
      act(() => tellOtherTabs({ type }))
      await flush()
    }
    expect(behind).not.toHaveBeenCalled()
    // A library change is another matter.
    read.mockResolvedValue(answer({ snapshot: snapshot(9) }))
    act(() => tellOtherTabs({ type: 'library', scope: 'account' }))
    await flush()
    await advance(INDEX_SETTLE_MS)
    expect(behind).toHaveBeenCalledTimes(1)
  })

  describe('a library version that moves while this tab is importing', () => {
    function busyMount() {
      const behind = vi.fn()
      const view = renderHook(
        ({ quiet }: { quiet: boolean }) => useAccountResults('u1', false, quiet, behind),
        { initialProps: { quiet: false } },
      )
      return { behind, view }
    }

    it('is this import’s own work: it is not read again when the import ends and notes the index current', async () => {
      const { behind, view } = busyMount()
      await flush()
      act(() => view.result.current.indexListed(2))
      read.mockResolvedValue(answer({ snapshot: snapshot(3) }))
      act(() => tellOtherTabs({ type: 'lifts' }))
      await flush()
      expect(behind).not.toHaveBeenCalled()
      act(() => view.result.current.indexListed())
      view.rerender({ quiet: true })
      await flush()
      expect(behind).not.toHaveBeenCalled()
    })

    it('is read again once the tab is quiet when the import did not note the index', async () => {
      const { behind, view } = busyMount()
      await flush()
      act(() => view.result.current.indexListed(2))
      read.mockResolvedValue(answer({ snapshot: snapshot(3) }))
      act(() => tellOtherTabs({ type: 'lifts' }))
      await flush()
      expect(behind).not.toHaveBeenCalled()
      view.rerender({ quiet: true })
      await flush()
      await advance(INDEX_SETTLE_MS)
      expect(behind).toHaveBeenCalledTimes(1)
    })
  })

  it('does not take a snapshot the server is still computing past for the library’s version: its next answer is not another device’s change', async () => {
    const behind = vi.fn()
    // The stored snapshot of the last compute, served while this tab's own import is computed; then the current one.
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(1), current: false }))
    read.mockResolvedValue(answer({ snapshot: snapshot(2) }))
    renderHook(() => useAccountResults('u1', false, true, behind))
    await flush()
    await advance(BUSY_RETRY_MS)
    expect(read).toHaveBeenCalledTimes(2)
    expect(behind).not.toHaveBeenCalled()
  })

  describe('when the server cannot be asked', () => {
    it('says so, asks again after the short wait and then at doubling ones, and clears it on an answer', async () => {
      read.mockRejectedValue(new Error('timeout'))
      const view = mount()
      await flush()
      expect(view.result.current.failed).toBe(true)
      expect(read).toHaveBeenCalledTimes(1)
      await advance(BUSY_RETRY_MS)
      expect(read).toHaveBeenCalledTimes(2)
      // The second wait is twice as long: an error is not asked about every few seconds either.
      await advance(BUSY_RETRY_MS)
      expect(read).toHaveBeenCalledTimes(2)
      await advance(BUSY_RETRY_MS)
      expect(read).toHaveBeenCalledTimes(3)
      read.mockResolvedValue(answer())
      await advance(2 * BUSY_RETRY_MS * 2)
      expect(view.result.current.failed).toBe(false)
      expect(view.result.current.results).not.toBeNull()
    })

    it('stands until an answer is current: the stored copy a held compute serves does not end it', async () => {
      read.mockRejectedValueOnce(new Error('timeout'))
      const view = mount()
      await flush()
      expect(view.result.current.failed).toBe(true)
      read.mockResolvedValue(answer({ current: false }))
      await advance(BUSY_RETRY_MS)
      expect(view.result.current.results).not.toBeNull()
      expect(view.result.current.failed).toBe(true)
      read.mockResolvedValue(answer())
      await advance(POLL_MS)
      expect(view.result.current.failed).toBe(false)
    })

    it('takes a 404 for the same, since the library has no results to show', async () => {
      read.mockResolvedValue({ kind: 'none' })
      const view = mount()
      await flush()
      expect(view.result.current.failed).toBe(true)
      await advance(BUSY_RETRY_MS)
      expect(read).toHaveBeenCalledTimes(2)
    })

    it('asks at once for the page’s Retry and keeps the waits where they were; one spent budget (a 429) offers none', async () => {
      read.mockRejectedValue(new Error('timeout'))
      const view = mount()
      await flush()
      await advance(BUSY_RETRY_MS)
      expect(read).toHaveBeenCalledTimes(2)
      // The next wait is the doubled one; Retry reads now, and the wait after it is longer still, not the short one again.
      act(() => view.result.current.retry?.())
      await flush()
      expect(read).toHaveBeenCalledTimes(3)
      await advance(BUSY_RETRY_MS * 2)
      expect(read).toHaveBeenCalledTimes(3)
      await advance(BUSY_RETRY_MS * 2)
      expect(read).toHaveBeenCalledTimes(4)
      read.mockRejectedValue(new ApiRequestError(429, 'rate_limited', 'Too many requests'))
      await advance(BUSY_RETRY_MS * 8)
      expect(view.result.current.failed).toBe(true)
      expect(view.result.current.retry).toBeNull()
    })
  })
})

describe('a 304 on the held copy', () => {
  it('makes the copy current when the server says so, and keeps it as it was otherwise', async () => {
    read.mockResolvedValueOnce(answer({ current: false }))
    const view = mount()
    await flush()
    expect(view.result.current.results?.current).toBe(false)
    read.mockResolvedValue({ kind: 'unchanged', nowMs: null, version: null, current: true })
    await advance(BUSY_RETRY_MS)
    expect(view.result.current.results?.current).toBe(true)
  })
})

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { snapshotContentHash } from '@rca/core/stateSnapshot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateRead } from '../../api/state'
import * as api from '../../api/state'
import { resultState, snapshotAt } from '../../test/stateCopyKit'
import { BUSY_RETRY_MS, POLL_MS, busyWaitMs, useAccountResults } from './accountResults'
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
      for (let i = 0; i < 5; i++) tellOtherTabs({ type: 'settings' })
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
    act(() => tellOtherTabs({ type: 'settings' }))
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
    act(() => tellOtherTabs({ type: 'settings' }))
    await flush()
    expect(behind).not.toHaveBeenCalled()
    act(() => tellOtherTabs({ type: 'settings' }))
    await flush()
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
    read.mockResolvedValueOnce({ kind: 'unchanged', nowMs: null, current: true })
    act(() => tellOtherTabs({ type: 'settings' }))
    await flush()
    expect(behind).not.toHaveBeenCalled()
    // An import on the phone moves the library to 6; the next 200 shows it.
    read.mockResolvedValueOnce(answer({ snapshot: snapshot(6) }))
    act(() => tellOtherTabs({ type: 'settings' }))
    await flush()
    expect(behind).toHaveBeenCalledTimes(1)
  })
})

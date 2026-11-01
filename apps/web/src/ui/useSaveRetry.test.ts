// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { SyncIssue } from '@rca/core/session'
import { describe, expect, it, vi } from 'vitest'
import { hasRetryableIssue, useSaveRetry } from './useSaveRetry'
import type { SaveRetryInput } from './useSaveRetry'

const issue = (code: SyncIssue['code']): SyncIssue => ({ code, count: 1 })

function input(overrides: Partial<SaveRetryInput> = {}): SaveRetryInput {
  return {
    signedIn: true,
    issues: [],
    outbox: null,
    busy: false,
    libraryStatus: 'loaded',
    resume: vi.fn(),
    ...overrides,
  }
}

const online = () => act(() => void window.dispatchEvent(new Event('online')))

describe('hasRetryableIssue', () => {
  it('is true for the connection and the server, and for nothing the athlete must act on', () => {
    expect(hasRetryableIssue([issue('network')])).toBe(true)
    expect(hasRetryableIssue([issue('signed-out'), issue('server')])).toBe(true)
    expect(hasRetryableIssue([issue('signed-out'), issue('activity-quota')])).toBe(false)
    expect(hasRetryableIssue([])).toBe(false)
  })
})

describe('useSaveRetry', () => {
  it('sends the saves again when the browser comes back online while a save waits', () => {
    const resume = vi.fn()
    renderHook(() => useSaveRetry(input({ issues: [issue('network')], resume })))
    online()
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('also waits on saves the outbox still holds after its last try', () => {
    const resume = vi.fn()
    const outbox = { pending: 2, saved: 0, failed: 0, finished: true }
    renderHook(() => useSaveRetry(input({ outbox, resume })))
    online()
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('does nothing online when nothing waits, or nobody is signed in', () => {
    const resume = vi.fn()
    renderHook(() => useSaveRetry(input({ resume })))
    renderHook(() => useSaveRetry(input({ signedIn: false, issues: [issue('network')], resume })))
    online()
    expect(resume).not.toHaveBeenCalled()
  })

  it.each([
    ['an import runs', { busy: true }],
    ['the library loads, which runs the outbox itself', { libraryStatus: 'loading' as const }],
    [
      'the outbox is already sending',
      { outbox: { pending: 1, saved: 0, failed: 0, finished: false } },
    ],
  ])('holds off while %s', (_why, overrides) => {
    const resume = vi.fn()
    const { result } = renderHook(() =>
      useSaveRetry(input({ issues: [issue('network')], resume, ...overrides })),
    )
    online()
    act(() => result.current.retry())
    expect(resume).not.toHaveBeenCalled()
  })

  it('ignores an online within 10 s of the last retry, and answers the next one after it', () => {
    const resume = vi.fn()
    let clock = 1_000_000
    renderHook(() => useSaveRetry(input({ issues: [issue('server')], resume, now: () => clock })))
    online()
    clock += 9_000
    online()
    expect(resume).toHaveBeenCalledTimes(1)
    clock += 2_000
    online()
    expect(resume).toHaveBeenCalledTimes(2)
  })

  it('stops listening once the saves are done', () => {
    const resume = vi.fn()
    const { rerender } = renderHook(
      (issues: SyncIssue[]) => useSaveRetry(input({ issues, resume })),
      { initialProps: [issue('network')] },
    )
    rerender([])
    online()
    expect(resume).not.toHaveBeenCalled()
  })

  it('retries for the visitor whenever it is asked, inside the online floor', () => {
    const resume = vi.fn()
    const { result } = renderHook(() => useSaveRetry(input({ issues: [issue('server')], resume })))
    act(() => result.current.retry())
    act(() => result.current.retry())
    expect(resume).toHaveBeenCalledTimes(2)
    expect(result.current.waiting).toBe(true)
  })
})

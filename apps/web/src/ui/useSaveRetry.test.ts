// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { SyncIssue } from '@rca/core/session'
import { describe, expect, it, vi } from 'vitest'
import { hasRetryableIssue, useSaveRetry } from './useSaveRetry'
import type { SaveRetryInput } from './useSaveRetry'

const issue = (code: SyncIssue['code']): SyncIssue => ({ code, count: 1 })

function input(overrides: Partial<SaveRetryInput> = {}): SaveRetryInput {
  return { signedIn: true, issues: [], outbox: null, busy: false, reload: vi.fn(), ...overrides }
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
  it('reads the library again when the browser comes back online while a save waits', () => {
    const reload = vi.fn()
    renderHook(() => useSaveRetry(input({ issues: [issue('network')], reload })))
    online()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('also waits on saves the outbox still holds after its last try', () => {
    const reload = vi.fn()
    const outbox = { pending: 2, saved: 0, failed: 0, finished: true }
    renderHook(() => useSaveRetry(input({ outbox, reload })))
    online()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing online when nothing waits, or nobody is signed in', () => {
    const reload = vi.fn()
    renderHook(() => useSaveRetry(input({ reload })))
    renderHook(() => useSaveRetry(input({ signedIn: false, issues: [issue('network')], reload })))
    online()
    expect(reload).not.toHaveBeenCalled()
  })

  it('holds off while an import runs, which is reading the library a retry would read again', () => {
    const reload = vi.fn()
    const { result } = renderHook(() =>
      useSaveRetry(input({ issues: [issue('network')], busy: true, reload })),
    )
    online()
    act(() => result.current.retry())
    expect(reload).not.toHaveBeenCalled()
  })

  it('stops listening once the saves are done', () => {
    const reload = vi.fn()
    const { rerender } = renderHook(
      (issues: SyncIssue[]) => useSaveRetry(input({ issues, reload })),
      {
        initialProps: [issue('network')],
      },
    )
    rerender([])
    online()
    expect(reload).not.toHaveBeenCalled()
  })

  it('retries for the visitor, by the same road, whenever it is asked', () => {
    const reload = vi.fn()
    const { result } = renderHook(() => useSaveRetry(input({ issues: [issue('server')], reload })))
    act(() => result.current.retry())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(result.current.waiting).toBe(true)
  })
})

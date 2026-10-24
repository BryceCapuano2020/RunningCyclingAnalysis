// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RESTORING_BOUND_MS, useRestoringWindow } from './useRestoringWindow'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

interface Props {
  restore: boolean
  loading: boolean
}

function renderWindow(restoring: boolean, accountLoading: boolean) {
  return renderHook(({ restore, loading }: Props) => useRestoringWindow(restore, loading), {
    initialProps: { restore: restoring, loading: accountLoading },
  })
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useRestoringWindow', () => {
  it('shows the restoring page while a kept library is restored and the account is still loading', () => {
    const { result } = renderWindow(true, true)
    expect(result.current).toBe(true)
  })

  it('shows nothing when no kept library is being restored', () => {
    const { result } = renderWindow(false, true)
    expect(result.current).toBe(false)
  })

  it('stays restoring when the account answers fast and the library is slow to reply', () => {
    const { result, rerender } = renderWindow(true, true)
    rerender({ restore: true, loading: false })
    expect(result.current).toBe(true)

    advance(RESTORING_BOUND_MS * 2)
    expect(result.current).toBe(true)
  })

  it('shows the landing page once the account has not answered within the bound', () => {
    const { result } = renderWindow(true, true)

    advance(RESTORING_BOUND_MS - 1)
    expect(result.current).toBe(true)

    advance(1)
    expect(result.current).toBe(false)
  })

  it('ends at the library reply, whatever the account has done', () => {
    const { result, rerender } = renderWindow(true, false)
    expect(result.current).toBe(true)

    rerender({ restore: false, loading: false })
    expect(result.current).toBe(false)
  })

  it('ends at the library reply while the account is still loading, before the bound', () => {
    const { result, rerender } = renderWindow(true, true)
    rerender({ restore: false, loading: true })
    expect(result.current).toBe(false)
  })

  it('does not return to restoring once the landing page has shown, even if the account answers late', () => {
    const { result, rerender } = renderWindow(true, true)
    advance(RESTORING_BOUND_MS)
    expect(result.current).toBe(false)

    rerender({ restore: true, loading: false })
    expect(result.current).toBe(false)
  })

  it('bounds the account wait at three seconds', () => {
    expect(RESTORING_BOUND_MS).toBe(3_000)
  })
})

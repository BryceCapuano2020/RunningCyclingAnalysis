// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDateOf } from '@rca/core/athlete'
import { useNow } from './useNow'

afterEach(() => {
  vi.useRealTimers()
})

describe('useNow', () => {
  it('ticks to the new day at local midnight, and not before', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 30))
    const { result } = renderHook(() => useNow())
    expect(localDateOf(result.current)).toBe('2026-06-10')
    act(() => vi.advanceTimersByTime(20 * 60_000))
    expect(localDateOf(result.current)).toBe('2026-06-10')
    act(() => vi.advanceTimersByTime(11 * 60_000))
    expect(localDateOf(result.current)).toBe('2026-06-11')
  })

  it('keeps the same time through the rest of the day, so nothing renders for it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 9, 0))
    const { result } = renderHook(() => useNow())
    const first = result.current
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 10, 18, 0))
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBe(first)
  })

  it('reads the day again when the tab is focused after a night asleep', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 22, 0))
    const { result } = renderHook(() => useNow())
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 12, 8, 0))
      window.dispatchEvent(new Event('focus'))
    })
    expect(localDateOf(result.current)).toBe('2026-06-12')
  })
})

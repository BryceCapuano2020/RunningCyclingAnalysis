// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCountedRuns, COUNTED_RUNS_KEY, MAX_COUNTED_RUNS } from './countedRunsStore'
import {
  COUNT_NOT_FORGOTTEN,
  COUNT_NOT_KEPT,
  COUNT_TOO_MANY,
  STATUS_MS,
  useCountedRuns,
} from './useCountedRuns'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useCountedRuns', () => {
  it('counts runs, keeps them for the next load, and goes back', () => {
    const { result, unmount } = renderHook(() => useCountedRuns())
    expect(result.current.keys).toEqual([])

    act(() => result.current.count(['run-20', 'run-10']))
    expect(result.current.notKept).toBeNull()
    expect(result.current.keys).toEqual(['run-10', 'run-20'])
    unmount()

    const reloaded = renderHook(() => useCountedRuns())
    expect(reloaded.result.current.keys).toEqual(['run-10', 'run-20'])
    act(() => reloaded.result.current.stop(['run-10']))
    expect(reloaded.result.current.keys).toEqual(['run-20'])
  })

  it('says what a change did, for a screen reader', () => {
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(['run-1', 'run-2', 'run-3']))
    expect(result.current.status).toBe('Counting 3 runs.')
    act(() => result.current.stop(['run-1']))
    expect(result.current.status).toBe('Leaving 1 run out.')
  })

  it('clears the status once it has been announced, so the same words can be said again', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useCountedRuns())
      act(() => result.current.count(['run-1']))
      expect(result.current.status).toBe('Counting 1 run.')
      act(() => void vi.advanceTimersByTime(STATUS_MS))
      expect(result.current.status).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves several runs out in one change', () => {
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(['run-1', 'run-2', 'run-3']))
    act(() => result.current.stop(['run-1', 'run-3']))
    expect(result.current.keys).toEqual(['run-2'])
  })

  it('keeps the same keys array until a choice changes, so the analysis settings do not move', () => {
    const { result, rerender } = renderHook(() => useCountedRuns())
    const before = result.current.keys
    rerender()
    expect(result.current.keys).toBe(before)
  })

  it('applies the choice for this visit and keeps saying the browser would not keep it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(['run-1']))
    expect(result.current.notKept).toBe(COUNT_NOT_KEPT)
    expect(result.current.keys).toEqual(['run-1'])
  })

  it('stops saying so once a later change is kept', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('full')
    })
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(['run-1']))
    expect(result.current.notKept).toBe(COUNT_NOT_KEPT)
    set.mockRestore()
    act(() => result.current.count(['run-2']))
    expect(result.current.notKept).toBeNull()
  })

  it('refuses, and says so, rather than dropping runs past the most it keeps', () => {
    const many = Array.from({ length: MAX_COUNTED_RUNS }, (_, i) => `run-${i}`)
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(many))
    expect(result.current.keys).toHaveLength(MAX_COUNTED_RUNS)

    act(() => result.current.count(['run-99999999']))
    expect(result.current.notKept).toBe(COUNT_TOO_MANY)
    expect(result.current.keys).toHaveLength(MAX_COUNTED_RUNS)
    expect(result.current.keys).not.toContain('run-99999999')
  })

  it('forgets every choice on clear', () => {
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(['run-1']))
    act(() => result.current.clear())
    expect(result.current.keys).toEqual([])
    expect(result.current.notKept).toBeNull()
    expect(localStorage.getItem(COUNTED_RUNS_KEY)).toBeNull()
  })

  it('says so, and still counts the runs, when the browser would not forget them', () => {
    const { result } = renderHook(() => useCountedRuns())
    act(() => result.current.count(['run-1']))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    act(() => result.current.clear())
    expect(result.current.notKept).toBe(COUNT_NOT_FORGOTTEN)
    expect(result.current.keys).toEqual(['run-1'])
  })

  it('follows a change made in another tab, and a clear made elsewhere in this one', () => {
    const { result } = renderHook(() => useCountedRuns())
    act(() => {
      localStorage.setItem(COUNTED_RUNS_KEY, JSON.stringify(['run-7']))
      window.dispatchEvent(new StorageEvent('storage', { key: COUNTED_RUNS_KEY }))
    })
    expect(result.current.keys).toEqual(['run-7'])

    act(() => void clearCountedRuns())
    expect(result.current.keys).toEqual([])
  })

  it('ignores another key’s storage event', () => {
    const { result } = renderHook(() => useCountedRuns())
    act(() => {
      localStorage.setItem(COUNTED_RUNS_KEY, JSON.stringify(['run-7']))
      window.dispatchEvent(new StorageEvent('storage', { key: 'rca.period.v1' }))
    })
    expect(result.current.keys).toEqual([])
  })
})

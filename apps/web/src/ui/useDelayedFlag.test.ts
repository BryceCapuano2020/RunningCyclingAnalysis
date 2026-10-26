// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedFlag } from './useDelayedFlag'

const DELAY_MS = 400

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Lets a number of milliseconds pass, inside act so React applies the state change. */
function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useDelayedFlag', () => {
  it('is false until the flag has been on for the delay, then true', () => {
    const { result } = renderHook(({ on }) => useDelayedFlag(on, DELAY_MS), {
      initialProps: { on: true },
    })
    expect(result.current).toBe(false)
    wait(DELAY_MS - 1)
    expect(result.current).toBe(false)
    wait(1)
    expect(result.current).toBe(true)
  })

  it('is never true for a flag that turns off within the delay', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, DELAY_MS), {
      initialProps: { on: true },
    })
    wait(DELAY_MS - 1)
    rerender({ on: false })
    wait(DELAY_MS * 2)
    expect(result.current).toBe(false)
  })

  it('is false the moment the flag turns off, after it has shown', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, DELAY_MS), {
      initialProps: { on: true },
    })
    wait(DELAY_MS)
    expect(result.current).toBe(true)
    rerender({ on: false })
    expect(result.current).toBe(false)
  })

  it('starts the delay again on each new run, so a second run waits for it too', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, DELAY_MS), {
      initialProps: { on: true },
    })
    wait(DELAY_MS)
    rerender({ on: false })
    rerender({ on: true })
    expect(result.current).toBe(false)
    wait(DELAY_MS - 1)
    expect(result.current).toBe(false)
    wait(1)
    expect(result.current).toBe(true)
  })

  it('stays false while the flag is off, with no timer left to fire', () => {
    const { result } = renderHook(({ on }) => useDelayedFlag(on, DELAY_MS), {
      initialProps: { on: false },
    })
    wait(DELAY_MS * 2)
    expect(result.current).toBe(false)
  })
})

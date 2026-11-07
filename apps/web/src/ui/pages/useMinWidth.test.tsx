// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMinWidth } from './useMinWidth'

/** A media query list whose answer the test changes, as a resize would. */
function fakeQuery(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const list = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  return {
    list,
    listeners,
    set(next: boolean) {
      matches = next
      for (const listener of listeners) listener()
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMinWidth', () => {
  it('follows the window as it crosses the width, and stops listening when unmounted', () => {
    const query = fakeQuery(false)
    vi.stubGlobal('matchMedia', () => query.list)
    const { result, unmount } = renderHook(() => useMinWidth(1024))
    expect(result.current).toBe(false)
    act(() => query.set(true))
    expect(result.current).toBe(true)
    unmount()
    expect(query.listeners.size).toBe(0)
  })
})

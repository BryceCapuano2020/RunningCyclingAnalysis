// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { noMatchMedia } from '../test/viewport'
import { TOUCH_QUERY, useMediaQuery, useTouchFirst } from './useMediaQuery'

afterEach(() => {
  cleanup()
  noMatchMedia()
})

/** A window whose queries match exactly when `matching` holds the query text, and that can change it. */
function windowMatching(initial: string[]) {
  let matching = initial
  const listeners = new Set<() => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return matching.includes(query)
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }),
  })
  return {
    set(next: string[]) {
      matching = next
      act(() => listeners.forEach((listener) => listener()))
    },
    listeners,
  }
}

describe('useMediaQuery', () => {
  it('never matches where there is no matchMedia', () => {
    noMatchMedia()
    expect(renderHook(() => useMediaQuery('(pointer: coarse)')).result.current).toBe(false)
  })

  it('follows the query as it changes, and lets go of it on unmount', () => {
    const view = windowMatching([])
    const { result, unmount } = renderHook(() => useMediaQuery('(pointer: coarse)'))
    expect(result.current).toBe(false)
    view.set(['(pointer: coarse)'])
    expect(result.current).toBe(true)
    unmount()
    expect(view.listeners.size).toBe(0)
  })

  it('reads a touch screen as a coarse pointer or no hover', () => {
    windowMatching([TOUCH_QUERY])
    expect(renderHook(() => useTouchFirst()).result.current).toBe(true)
    cleanup()
    windowMatching([])
    expect(renderHook(() => useTouchFirst()).result.current).toBe(false)
  })
})

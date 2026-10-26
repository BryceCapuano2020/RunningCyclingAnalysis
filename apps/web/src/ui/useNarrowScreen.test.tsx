// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { noMatchMedia, viewportAt } from '../test/viewport'
import { useNarrowScreen } from './useNarrowScreen'

afterEach(() => {
  cleanup()
  noMatchMedia()
})

describe('useNarrowScreen', () => {
  it('follows a resize across the width, as the media query fires its change', () => {
    const viewport = viewportAt(1280)
    const { result } = renderHook(() => useNarrowScreen(560))
    expect(result.current).toBe(false)

    viewport.resize(390)
    expect(result.current).toBe(true)

    viewport.resize(1280)
    expect(result.current).toBe(false)
  })

  it('is never narrow where the window has no media queries', () => {
    noMatchMedia()
    const { result } = renderHook(() => useNarrowScreen(560))
    expect(result.current).toBe(false)
  })
})

// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHeaderHeight } from './useHeaderHeight'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--header-height')
})

describe('useHeaderHeight', () => {
  it('sets --header-height to the element height, and on unmount removes it and disconnects the observer', () => {
    const disconnected = vi.fn()
    class FakeResizeObserver {
      observe() {}
      disconnect() {
        disconnected()
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
    const header = { current: document.createElement('header') }

    const view = renderHook(() => useHeaderHeight(header))
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('120px')

    view.unmount()
    expect(disconnected).toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('')
  })

  it('leaves --header-height to the tokens while there is no element to measure', () => {
    renderHook(() => useHeaderHeight({ current: null }))
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('')
  })
})

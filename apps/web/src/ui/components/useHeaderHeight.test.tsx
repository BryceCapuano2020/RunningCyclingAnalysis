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
  it('sets --header-height to the element height while it sticks, and on unmount removes it and disconnects the observer', () => {
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
    header.current.style.position = 'sticky'

    const view = renderHook(() => useHeaderHeight(header))
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('120px')

    view.unmount()
    expect(disconnected).toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('')
  })

  it('sets --header-height to zero while the element scrolls with the page, so nothing clears it', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
    renderHook(() => useHeaderHeight({ current: document.createElement('header') }))
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('0px')
  })

  it('leaves --header-height to the tokens while there is no element to measure', () => {
    renderHook(() => useHeaderHeight({ current: null }))
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('')
  })
})

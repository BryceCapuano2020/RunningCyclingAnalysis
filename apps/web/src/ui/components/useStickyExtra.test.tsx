// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStickyExtra } from './useStickyExtra'

const extra = () => document.documentElement.style.getPropertyValue('--sticky-extra')

/** A bar of the given height whose computed position is `position`. */
function bar(position: string, height: number): HTMLElement {
  const element = document.createElement('div')
  element.style.position = position
  Object.defineProperty(element, 'offsetHeight', { value: height, configurable: true })
  document.body.append(element)
  return element
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('useStickyExtra', () => {
  it('sets --sticky-extra to the height of a stuck bar, and removes it on unmount', () => {
    const view = renderHook(() => useStickyExtra(bar('sticky', 56)))
    expect(extra()).toBe('56px')
    view.unmount()
    expect(extra()).toBe('')
  })

  it('adds nothing for a bar that does not stick at this width', () => {
    renderHook(() => useStickyExtra(bar('static', 56)))
    expect(extra()).toBe('')
  })

  it('sums the bars that are stuck together, and follows each as it goes', () => {
    const nav = bar('sticky', 56)
    const readout = bar('sticky', 80)
    const first = renderHook(() => useStickyExtra(nav))
    const second = renderHook(() => useStickyExtra(readout))
    expect(extra()).toBe('136px')
    second.unmount()
    expect(extra()).toBe('56px')
    first.unmount()
    expect(extra()).toBe('')
  })

  it('re-measures when the window is resized, as a breakpoint can start or end the sticking', () => {
    const element = bar('static', 56)
    renderHook(() => useStickyExtra(element))
    expect(extra()).toBe('')
    element.style.position = 'sticky'
    window.dispatchEvent(new Event('resize'))
    expect(extra()).toBe('56px')
  })

  it('re-measures when the observed bar changes size', () => {
    let notify = () => {}
    class FakeResizeObserver {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    let height = 48
    const element = bar('sticky', 0)
    Object.defineProperty(element, 'offsetHeight', { get: () => height, configurable: true })
    renderHook(() => useStickyExtra(element))
    expect(extra()).toBe('48px')
    height = 90
    notify()
    expect(extra()).toBe('90px')
  })

  it('leaves --sticky-extra alone while there is no bar to measure', () => {
    renderHook(() => useStickyExtra(null))
    expect(extra()).toBe('')
  })
})

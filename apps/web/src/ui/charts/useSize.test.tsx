// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSize } from './useSize'

function Probe() {
  const [ref, width] = useSize()
  return <div ref={ref}>width {width}</div>
}

/** Records the callback and the observed elements, so a test can fire resizes by hand. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  disconnected = false
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }

  observe(element: Element) {
    this.observed.push(element)
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true
  }

  fire(width: number) {
    const entry = { contentRect: { width } } as unknown as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
}

describe('useSize', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('falls back to 640 when ResizeObserver is unavailable', () => {
    render(<Probe />)
    expect(screen.getByText('width 640')).toBeInTheDocument()
  })

  describe('with a ResizeObserver', () => {
    beforeEach(() => {
      FakeResizeObserver.instances = []
      vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    })

    it('observes the element and reports its floored width on resize', () => {
      const { container } = render(<Probe />)
      const observer = FakeResizeObserver.instances[0]
      expect(observer?.observed).toEqual([container.firstElementChild])

      act(() => observer?.fire(512.7))
      expect(screen.getByText('width 512')).toBeInTheDocument()
    })

    it('ignores widths that floor to zero or below', () => {
      render(<Probe />)
      const observer = FakeResizeObserver.instances[0]

      act(() => observer?.fire(300))
      act(() => observer?.fire(0.5))
      expect(screen.getByText('width 300')).toBeInTheDocument()

      act(() => observer?.fire(0))
      expect(screen.getByText('width 300')).toBeInTheDocument()
    })

    it('disconnects the observer on unmount', () => {
      const { unmount } = render(<Probe />)
      const observer = FakeResizeObserver.instances[0]
      expect(observer?.disconnected).toBe(false)
      unmount()
      expect(observer?.disconnected).toBe(true)
    })
  })
})

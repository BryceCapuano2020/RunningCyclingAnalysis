import { vi } from 'vitest'

/** A ResizeObserver that reports a chart at this width, as a browser does on the first measurement. Undone by vi.unstubAllGlobals. */
export function chartWidth(width: number): void {
  class SizedObserver {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', SizedObserver)
}

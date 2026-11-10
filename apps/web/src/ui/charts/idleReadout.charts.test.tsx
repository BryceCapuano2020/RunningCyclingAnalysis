// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { curvePoint } from './test/fixtures'
import { SportCurveChart } from './SportCurveChart'

beforeAll(() => {
  // A dot is dated on the viewer's own day, so the zone is pinned: the day named does not depend on the machine's.
  vi.stubEnv('TZ', 'UTC')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A ResizeObserver that reports the chart at a width, as a browser does on the first measurement. */
function chartWidth(width: number) {
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

describe('the sport pages’ charts on a phone', () => {
  it('says the best 20 min in the curve’s readout row until a point is selected', () => {
    chartWidth(340)
    render(
      <SportCurveChart
        sport="run"
        curve={[
          curvePoint(180, 5.0, 'run-1'),
          curvePoint(300, 4.5, 'run-1'),
          curvePoint(1200, 4.0, 'run-2'),
          curvePoint(3600, 3.5, 'run-2'),
        ]}
        previous={null}
        change={null}
        massKg={75}
        units="metric"
      />,
    )
    const idle = screen.getByTestId('chart-readout').getAttribute('data-idle')
    expect(idle).toMatch(/^Best · 20 min: .*4:10/)
  })
})

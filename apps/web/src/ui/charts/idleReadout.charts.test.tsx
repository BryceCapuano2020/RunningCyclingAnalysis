// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { curvePoint } from './fixtures'
import { SportCurveChart } from './SportCurveChart'
import { TrendChart } from './TrendChart'

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

const WEEK_MS = 7 * 86_400_000
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const runPoint = (week: number, speed: number): TrendPoint => {
  const endMs = FIRST_END + week * WEEK_MS
  return {
    endMs,
    runWkg: RESTING_W_PER_KG + FLAT_RUN_COST * speed,
    rideWkg: null,
    runCount: 1,
    rideCount: 0,
    runAtMs: endMs,
    rideAtMs: null,
    rideRunSpeed: null,
  }
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
        massKg={75}
        units="metric"
      />,
    )
    const idle = screen.getByTestId('chart-readout').getAttribute('data-idle')
    expect(idle).toMatch(/^Best · 20 min: .*4:10/)
  })

  it('says the latest week in the week-by-week readout row', () => {
    chartWidth(340)
    render(
      <TrendChart
        sport="run"
        points={[runPoint(0, 4), runPoint(1, 4.1), runPoint(2, 4.2)]}
        massKg={75}
        units="metric"
        windowDays={14}
        effortS={1200}
      />,
    )
    const idle = screen.getByTestId('chart-readout').getAttribute('data-idle')
    expect(idle).toMatch(/^Latest · Week ending .*3:58/)
  })

  it('has no readout row for a chart with no points', () => {
    chartWidth(340)
    render(
      <TrendChart
        sport="run"
        points={[]}
        massKg={75}
        units="metric"
        windowDays={14}
        effortS={1200}
      />,
    )
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })
})

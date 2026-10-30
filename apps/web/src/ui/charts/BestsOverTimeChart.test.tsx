// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { BestsOverTimeChart } from './BestsOverTimeChart'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

const DAY = 86_400_000
const START = Date.UTC(2026, 0, 5)
const point = (week: number, speed: number, atDay: number): TrendPoint => ({
  endMs: START + week * 7 * DAY + 6 * DAY,
  runWkg: RESTING_W_PER_KG + FLAT_RUN_COST * speed,
  rideWkg: null,
  runCount: 1,
  rideCount: 0,
  runAtMs: START + atDay * DAY,
  rideAtMs: null,
  rideRunSpeed: null,
})
const POINTS = [point(0, 3.8, 1), point(1, 3.8, 1), point(2, 4.0, 15), point(3, 4.1, 24)]

describe('BestsOverTimeChart', () => {
  it('draws a dot for each effort that led a window, fainter the older, and no line and no wash', () => {
    chartWidth(640)
    const { container } = render(
      <BestsOverTimeChart
        sport="run"
        points={POINTS}
        massKg={70}
        units="metric"
        effortS={1200}
        takeaway={null}
      />,
    )
    const dots = Array.from(container.querySelectorAll('[data-testid^="bests-"]'))
    expect(dots).toHaveLength(3)
    const opacities = dots.map((dot) => Number(dot.getAttribute('fill-opacity')))
    expect(opacities[2]).toBe(1)
    expect(opacities[0]).toBeLessThan(opacities[1]!)
    expect(opacities[1]).toBeLessThan(opacities[2]!)
    expect(container.querySelector('[data-testid="bests-latest"]')).toBe(dots[2])
    expect(
      container.querySelector('path.chart-series__line, [data-testid="trend-wash"]'),
    ).toBeNull()
  })

  it('is named by the finding when the change test makes one, and by what it plots when it does not', () => {
    chartWidth(640)
    const found = render(
      <BestsOverTimeChart
        sport="run"
        points={POINTS}
        massKg={70}
        units="metric"
        effortS={1200}
        takeaway="20 min is 8 s/km quicker than the previous 12 weeks"
      />,
    )
    expect(
      screen.getByRole('figure', { name: '20 min is 8 s/km quicker than the previous 12 weeks' }),
    ).toBeInTheDocument()
    found.unmount()
    render(
      <BestsOverTimeChart
        sport="run"
        points={POINTS}
        massKg={70}
        units="metric"
        effortS={1200}
        takeaway={null}
      />,
    )
    expect(screen.getByRole('figure', { name: 'Best 20 min runs by day' })).toBeInTheDocument()
  })

  it('lists each dot by its day in the table, oldest first, in the sport’s unit', () => {
    chartWidth(640)
    const { container } = render(
      <BestsOverTimeChart
        sport="run"
        points={POINTS}
        massKg={70}
        units="metric"
        effortS={1200}
        takeaway={null}
      />,
    )
    const rows = Array.from(container.querySelectorAll('tbody tr'), (row) =>
      Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent),
    )
    expect(rows).toHaveLength(3)
    expect(rows[0]![0]).toBe('6 Jan 2026')
    expect(rows[0]![1]).toBe('4:23 /km')
  })

  it('says what it waits for with fewer than two dots', () => {
    chartWidth(640)
    render(
      <BestsOverTimeChart
        sport="run"
        points={[POINTS[0]!]}
        massKg={70}
        units="metric"
        effortS={1200}
        takeaway={null}
      />,
    )
    expect(screen.getByText('Add runs on more than one day to see them here')).toBeInTheDocument()
  })
})

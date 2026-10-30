// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { BestsOverTimeChart } from './BestsOverTimeChart'
import type { BestsOverTimeChartProps } from './BestsOverTimeChart'

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
})
const POINTS = [point(0, 3.8, 1), point(1, 3.8, 1), point(2, 4.0, 15), point(3, 4.1, 24)]
const PROPS: BestsOverTimeChartProps = {
  sport: 'run',
  points: POINTS,
  massKg: 70,
  units: 'metric',
  effortS: 1200,
  takeaway: null,
  comparedWith: null,
}

describe('BestsOverTimeChart', () => {
  it('draws a dot for each effort that led a window, fainter the older, and no line and no wash', () => {
    chartWidth(640)
    const { container } = render(<BestsOverTimeChart {...PROPS} />)
    const dots = Array.from(container.querySelectorAll('[data-testid^="bests-"]'))
    expect(dots).toHaveLength(3)
    const opacities = dots.map((dot) => Number(dot.getAttribute('fill-opacity')))
    expect(opacities[2]).toBe(1)
    expect(opacities[0]).toBeGreaterThanOrEqual(0.45)
    expect(opacities[0]).toBeLessThan(opacities[1]!)
    expect(opacities[1]).toBeLessThan(opacities[2]!)
    expect(container.querySelector('[data-testid="bests-latest"]')).toBe(dots[2])
    // The dots are in the plot, and nothing in it is a line or an area.
    expect(container.querySelector('svg circle.chart-series__marker--run')).not.toBeNull()
    expect(
      container.querySelector('svg path.chart-series__line, svg path.chart-series__area'),
    ).toBeNull()
  })

  it('rings each dot in the card colour, whatever its age, so it reads on either scheme', () => {
    chartWidth(640)
    const { container } = render(<BestsOverTimeChart {...PROPS} />)
    for (const dot of container.querySelectorAll('[data-testid^="bests-"]')) {
      expect(dot).toHaveClass('chart-series__marker')
    }
  })

  it('marks the older dots, which forced colours draw hollow, and not the newest', () => {
    chartWidth(640)
    const { container } = render(<BestsOverTimeChart {...PROPS} />)
    const dots = Array.from(container.querySelectorAll('[data-testid^="bests-"]'))
    expect(dots[0]).toHaveClass('bests-dot--old')
    expect(dots[2]).not.toHaveClass('bests-dot--old')
  })

  it('names the figure with the effort, by the finding when there is one and by what it plots when not', () => {
    chartWidth(640)
    const found = render(
      <BestsOverTimeChart
        {...PROPS}
        takeaway="20 min is 8 s/km faster than the previous 12 weeks"
        comparedWith="Previous 12 weeks"
      />,
    )
    const figure = screen.getByRole('figure', {
      name: '20 min is 8 s/km faster than the previous 12 weeks',
    })
    // The line under the title says what the comparison is, since the dots are this period's alone.
    expect(figure).toHaveTextContent(
      "The finding compares this period's best with the previous 12 weeks.",
    )
    found.unmount()
    render(<BestsOverTimeChart {...PROPS} />)
    expect(screen.getByRole('figure', { name: 'Best 20 min runs by day' })).toBeInTheDocument()
  })

  it('lists each dot by its day in the table, oldest first, in the sport’s unit', () => {
    chartWidth(640)
    const { container } = render(<BestsOverTimeChart {...PROPS} />)
    const rows = Array.from(container.querySelectorAll('tbody tr'), (row) =>
      Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent),
    )
    expect(rows).toHaveLength(3)
    expect(rows[0]![0]).toBe('6 Jan 2026')
    expect(rows[0]![1]).toBe('4:23 /km')
  })

  it('says what it waits for with fewer than two dots', () => {
    chartWidth(640)
    render(<BestsOverTimeChart {...PROPS} points={[POINTS[0]!]} />)
    expect(screen.getByText('Add runs on more than one day to see them here')).toBeInTheDocument()
  })

  it('draws its dots and axes at 320 px, inside the plot', () => {
    chartWidth(320)
    const { container } = render(<BestsOverTimeChart {...PROPS} />)
    const dots = Array.from(container.querySelectorAll('[data-testid^="bests-"]'))
    expect(dots).toHaveLength(3)
    for (const dot of dots) {
      const x = Number(dot.getAttribute('cx'))
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(320)
    }
    expect(container.querySelectorAll('.chart-x-axis__tick').length).toBeGreaterThanOrEqual(2)
  })

  it('reads a dot from the keyboard: the arrows move through the dots, oldest to newest', () => {
    chartWidth(640)
    render(<BestsOverTimeChart {...PROPS} />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('6 Jan 2026')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('20 Jan 2026')
    fireEvent.keyDown(surface, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('6 Jan 2026')
  })
})

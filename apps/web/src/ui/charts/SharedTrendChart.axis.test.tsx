// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SharedWeek } from './gradeTrend'
import { SharedTrendChart } from './SharedTrendChart'
import { week } from './sharedTrendFixtures'

afterEach(cleanup)

function renderChart(weeks: SharedWeek[], axis?: Parameters<typeof SharedTrendChart>[0]['axis']) {
  return render(
    <SharedTrendChart
      weeks={weeks}
      windowDays={14}
      effortS={1200}
      latestStartMs={{ run: null, ride: null }}
      axis={axis}
    />,
  )
}

/** Weeks 0 to count - 1, each with a run and a ride, except the weeks `empty` says. */
const series = (count: number, empty: (i: number) => boolean, run = 0.6, ride = 0.5) =>
  Array.from({ length: count }, (_, i) =>
    week(i, empty(i) ? null : run + (i % 5) / 100, empty(i) ? null : ride + (i % 3) / 100),
  )

describe('SharedTrendChart over a year with nothing in it', () => {
  const gapped = series(90, (i) => i >= 12 && i < 72)

  it('skips the year, with a break mark on the axis and the dates in the notes', () => {
    const { container } = renderChart(gapped)
    expect(container.querySelectorAll('[data-testid="axis-break"]')).toHaveLength(1)
    expect(container.querySelector('.chart-about')).toHaveTextContent(
      /The axis skips .* to .*, where there is nothing to show/,
    )
    expect(container.querySelector('[data-testid="axis-break"] title')?.textContent).toMatch(
      /^The axis skips .* to /,
    )
  })

  it('leaves the skipped weeks out of the table, and draws no comb of empty-week marks', () => {
    const { container } = renderChart(gapped)
    const dates = Array.from(container.querySelectorAll('tbody th')).map((th) => th.textContent)
    // 12 weeks before, 18 after: by month, a handful of rows each side and none from the empty year.
    expect(dates.length).toBeLessThan(14)
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(0)
  })

  it('draws the two sides of the gap close, not a year apart', () => {
    const { container } = renderChart(gapped)
    const line = container.querySelector('[data-testid="trend-line"][data-sport="run"]')
    const xs = (line?.getAttribute('d')?.match(/(?<=[ML C])\d+(\.\d)?(?= )/g) ?? []).map(Number)
    expect(xs.length).toBeGreaterThan(4)
    // The line is two stretches; the plot is about 500 px, and the year between them is a small mark.
    const break_ = container.querySelector('[data-testid="axis-break"] .axis-break__line')
    const at = Number(break_?.getAttribute('x1'))
    expect(at).toBeGreaterThan(56)
    expect(at).toBeLessThan(560)
  })

  it('shares the time axis a caller gives it, so a chart under it can skip the same years', () => {
    const base = series(36, () => false)
    const axis = {
      startMs: base[8]!.endMs,
      endMs: base[33]!.endMs,
      gaps: [{ fromMs: base[16]!.endMs, toMs: base[24]!.endMs }],
    }
    const { container } = renderChart(base, axis)
    expect(container.querySelectorAll('[data-testid="axis-break"]')).toHaveLength(1)
    // Weeks 8 to 33 less the 7 inside the gap: 19 rows.
    const tables = container.querySelectorAll('table')
    expect(tables[tables.length - 1]!.querySelectorAll('tbody tr')).toHaveLength(19)
    // The skipped stretch is in a small table of its own, and in the figure's description.
    expect(tables[0]!.querySelector('caption')).toHaveTextContent('Stretches the time axis skips')
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toMatch(
      /The time axis skips/,
    )
  })
})

describe('SharedTrendChart with a stretch of line cut off by breaks', () => {
  /** Two runs, then ten weeks with none, then a long stretch: the first is isolated. */
  const cut = Array.from({ length: 24 }, (_, i) =>
    week(i, i < 2 || i >= 12 ? 0.6 + (i % 4) / 100 : null, null),
  )

  it('draws the isolated stretch as one marker at its mean, not a two-point line', () => {
    const { container } = renderChart(cut)
    const line = container.querySelector('[data-testid="trend-line"][data-sport="run"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(1)
    const isolated = container.querySelectorAll('[data-isolated="true"][data-sport="run"]')
    expect(isolated).toHaveLength(1)
    const [first, second] = [0, 1].map((i) => i)
    expect(first).toBeLessThan(second as number)
  })

  it('draws no marker of its own for the points of an isolated stretch', () => {
    const { container } = renderChart(cut)
    // 2 points of the isolated stretch have no marker each; the one at its mean is the stretch's marker.
    const markers = container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]')
    const plain = Array.from(markers).filter((m) => m.getAttribute('data-isolated') !== 'true')
    expect(plain.length).toBe(markers.length - 1)
    expect(markers.length).toBeLessThanOrEqual(1 + 12)
  })

  it('draws an isolated estimated ride as a ring with its 90% range through it', () => {
    const rides = Array.from({ length: 24 }, (_, i) =>
      week(i, null, i < 1 || i >= 12 ? 0.5 + (i % 4) / 100 : null),
    )
    const { container } = renderChart(rides)
    const ring = container.querySelector('[data-testid="trend-ring"][data-isolated="true"]')
    expect(ring).not.toBeNull()
    const bar = container.querySelector('[data-testid="trend-interval"]')
    expect(bar?.getAttribute('x1')).toBe(ring?.getAttribute('cx'))
    expect(Number(bar?.getAttribute('y2'))).toBeGreaterThan(Number(bar?.getAttribute('y1')))
  })

  it('keeps the last stretch a line of its own, even when it is two points, so its end label has its marker', () => {
    const tail = Array.from({ length: 24 }, (_, i) =>
      week(i, i < 8 || i >= 22 ? 0.6 + (i % 4) / 100 : null, null),
    )
    const { container } = renderChart(tail)
    const line = container.querySelector('[data-testid="trend-line"][data-sport="run"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
  })
})

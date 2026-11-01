// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DAY_MS } from '@rca/core/constants'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import type { VolumeWeek } from '../weeklyVolume'
import { WeeklyVolumeChart } from './WeeklyVolumeChart'

const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const HOUR = 3600

/** Weeks of [run hours, ride hours] ending on consecutive Sundays from 12 January 2025. */
function weeksOf(...hours: [number, number][]): VolumeWeek[] {
  return hours.map(([run, ride], i) => ({
    endMs: FIRST_END + i * 7 * DAY_MS,
    seconds: { run: run * HOUR, ride: ride * HOUR },
  }))
}

/** A run-heavy block, a rest week, then a cycling block. */
const WEEKS = weeksOf([4, 0], [3.5, 1], [0, 0], [1, 5], [0.5, 6])

function renderChart(weeks = WEEKS) {
  return render(<WeeklyVolumeChart weeks={weeks} />)
}

/** A ResizeObserver that reports the chart at a width, as a browser does on the first measurement. */
function chartWidth(width: number) {
  class SizedObserver {
    private readonly callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe() {
      const entry = { contentRect: { width } } as unknown as ResizeObserverEntry
      this.callback([entry], this as unknown as ResizeObserver)
    }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', SizedObserver)
}

/** The rows of the chart's own table, not the small table that names the skipped stretches before it. */
const mainRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('table')).at(-1)?.querySelectorAll('tbody tr') ?? []

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WeeklyVolumeChart', () => {
  it('is titled by what it measures, and says nothing about what moved', () => {
    renderChart()
    const figure = screen.getByRole('figure', { name: 'Training hours' })
    expect(figure.querySelector('figcaption')).toHaveTextContent(/^Training hours$/)
    expect(figure.querySelector('.chart-frame__lede')).toBeNull()
    expect(figure).not.toHaveTextContent(/rose from|fell from|of your running and riding hours/)
  })

  it('labels the tallest bar with its hours', () => {
    const { container } = renderChart()
    expect(container.querySelector('[data-testid="volume-peak"]')).toHaveTextContent('6.5 h')
  })

  it('rounds the top of each bar and keeps its parts a gap apart', () => {
    const { container } = renderChart()
    const [first] = container.querySelectorAll('[data-testid="volume-bar"]')
    expect(first?.getAttribute('d')).toContain('A')
  })

  it('draws a span past 26 weeks as bars a month, in hours a week, and says so', () => {
    const long = weeksOf(...Array.from({ length: 60 }, (): [number, number] => [3, 1]))
    const { container } = renderChart(long)
    expect(container.querySelectorAll('[data-testid="volume-bar"]').length).toBeLessThan(50)
    expect(container.querySelector('.chart-frame__note')).toHaveTextContent(
      'Average hours a week, by month.',
    )
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers[0]).toBe('Month to')
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Average of 3 weeks')
    expect(screen.getByRole('status')).toHaveTextContent('3.0 h Run')
  })

  it('keeps a bar a week up to 26 weeks, with no note about months', () => {
    const { container } = renderChart(
      weeksOf(...Array.from({ length: 26 }, (): [number, number] => [3, 1])),
    )
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(52)
    expect(container.querySelector('.chart-frame__note')).toBeNull()
  })

  it('draws one part of a bar for each sport that trained, in the sport it names', () => {
    const { container } = renderChart()
    const bars = Array.from(container.querySelectorAll('[data-testid="volume-bar"]'))
    expect(bars.map((bar) => bar.getAttribute('data-sport'))).toEqual([
      'run',
      'run',
      'ride',
      'run',
      'ride',
      'run',
      'ride',
    ])
  })

  it('draws a week with no training as no bar, and no mark on the axis for it', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="axis-break"]')).toHaveLength(0)
    // Five weeks, one of them empty, give seven parts of bars.
    expect(container.querySelectorAll('[data-testid="volume-bar"]')).toHaveLength(7)
  })

  it('starts at the first week with real volume, so near-empty early weeks leave no sliver', () => {
    const slivers = weeksOf([0.1, 0], [0.05, 0], [0.1, 0], [3, 1], [4, 0], [2, 2])
    const { container } = renderChart(slivers)
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toMatch(/Sun 2 Feb 2025/)
  })

  it('skips a year or more with no training, with one break mark and a note of its dates', () => {
    const quiet = Array.from({ length: 60 }, (): [number, number] => [0, 0])
    const weeks = weeksOf([3, 1], [3, 1], [3, 1], ...quiet, [4, 0], [4, 0], [4, 0])
    const { container } = renderChart(weeks)
    expect(container.querySelectorAll('[data-testid="axis-break"]')).toHaveLength(1)
    expect(container.querySelector('.chart-about')).toHaveTextContent(/The axis skips .* to .*/)
    // The skipped weeks are not rows of the table: the six that remain are six weeks drawn, though a year apart.
    expect(mainRows(container)).toHaveLength(6)
    // The text view says which stretch the axis skips, in a small table of its own.
    expect(container.querySelector('caption')).toHaveTextContent('Stretches the time axis skips')
    // Its row names the first and last week either side of the skipped stretch.
    const skipped = Array.from(container.querySelectorAll('table')).find(
      (table) => table.querySelector('caption')?.textContent === 'Stretches the time axis skips',
    )
    expect(Array.from(skipped?.querySelectorAll('thead th') ?? [], (th) => th.textContent)).toEqual(
      ['Skipped from', 'Skipped to'],
    )
    const cells = Array.from(
      skipped?.querySelectorAll('tbody th, tbody td') ?? [],
      (c) => c.textContent,
    )
    expect(cells[0]).toBe('Sun 26 Jan 2025')
    expect(cells[1]).toMatch(/^Sun 29 Mar( 2026)?$/)
    expect(
      container.querySelector('svg [role="img"], [role="img"]')?.getAttribute('aria-label'),
    ).toMatch(/The time axis skips .* to /)
  })

  it('shares the axis a caller gives it, so it skips what the trend above it skips', () => {
    const weeks = weeksOf(...Array.from({ length: 10 }, (): [number, number] => [3, 1]))
    const axis = {
      startMs: weeks[0]!.endMs,
      endMs: weeks[9]!.endMs,
      gaps: [{ fromMs: weeks[3]!.endMs, toMs: weeks[7]!.endMs }],
    }
    const { container } = render(<WeeklyVolumeChart weeks={weeks} axis={axis} />)
    expect(container.querySelectorAll('[data-testid="axis-break"]')).toHaveLength(1)
    // The three weeks inside the gap are not rows.
    expect(mainRows(container)).toHaveLength(7)
  })

  it('keys the sports that trained, and leaves the key out for one', () => {
    renderChart()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Run', 'Ride'])
    cleanup()
    renderChart(weeksOf([2, 0], [3, 0], [1, 0]))
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('gives every week in a table, with the hours of each sport and the total', () => {
    renderChart()
    screen.getByText('View as table')
    const table = screen.getByRole('table', { name: 'Hours trained each week, by sport' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual(['Week ending', 'Run (h)', 'Ride (h)', 'Total (h)'])
    const rows = within(table).getAllByRole('row').slice(1)
    const text = rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    )
    expect(rows).toHaveLength(5)
    expect(within(rows[0]!).getByRole('rowheader')).toHaveTextContent('Sun 12 Jan 2025')
    expect(text[0]).toEqual(['4.0', '—', '4.0'])
    expect(text[1]).toEqual(['3.5', '1.0', '4.5'])
    expect(text[2]).toEqual(['—', '—', '—'])
    expect(text[4]).toEqual(['0.5', '6.0', '6.5'])
  })

  it('reads a week by keyboard: its hours in each sport and the total', () => {
    renderChart()
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('Week ending Sun 19 Jan 2025')
    expect(tooltip).toHaveTextContent('3.5 h Run')
    expect(tooltip).toHaveTextContent('1.0 h Ride')
    expect(tooltip).toHaveTextContent('4.5 h Total')
  })

  it('says a week without training had none', () => {
    renderChart()
    const surface = screen.getByTestId('plot-surface')
    for (let i = 0; i < 3; i++) fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('No training this week')
  })

  it('gives a one-sport week its hours without a total that repeats them', () => {
    renderChart()
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('4.0 h Run')
    expect(tooltip).not.toHaveTextContent('Total')
  })

  it('keeps every bar inside the chart at 320 px', () => {
    chartWidth(320)
    const { container } = renderChart()
    const svg = container.querySelector('svg.chart-frame__svg')
    expect(svg?.getAttribute('width')).toBe('320')
    for (const bar of container.querySelectorAll('[data-testid="volume-bar"]')) {
      const left = Number(bar.getAttribute('data-left'))
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + Number(bar.getAttribute('data-width'))).toBeLessThanOrEqual(320)
    }
  })
})

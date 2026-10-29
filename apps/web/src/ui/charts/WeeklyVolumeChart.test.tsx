// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DAY_MS } from '@rca/core/constants'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VolumeWeek } from '../weeklyVolume'
import { readStylesheet } from '../components/stylesheet'
import { WeeklyVolumeChart } from './WeeklyVolumeChart'

const css = await readStylesheet(import.meta.url, './WeeklyVolumeChart.css')

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

const LEDE =
  'Cycling rose from 10% of your running and riding hours in the first half to 80% in the second.'

function renderChart(weeks = WEEKS) {
  return render(<WeeklyVolumeChart weeks={weeks} lede={LEDE} />)
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WeeklyVolumeChart', () => {
  it('is named once, by its title, and says its finding under it', () => {
    renderChart()
    const figure = screen.getByRole('figure', { name: 'Training hours per week' })
    expect(within(figure).getByText(LEDE)).toBeInTheDocument()
    expect(screen.getAllByText('Training hours per week')).toHaveLength(1)
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

  it('rounds the data end of each bar, the top part only, and keeps a 2 px gap between stacked parts', () => {
    chartWidth(900)
    const { container } = renderChart(weeksOf([4, 0], [3.5, 1]))
    const parts = [...container.querySelectorAll('[data-testid="volume-bar"]')]
    // The first week is run alone, the second run under ride: the top part of each bar is the rounded one.
    expect(parts.map((part) => part.getAttribute('rx'))).toEqual(['2', null, '2'])
    expect(parts[0]).toHaveClass('volume-bar--edged')
    expect(css).toMatch(/\.volume-bar--edged \{[^}]*stroke-width: 2;/)
  })

  it('leaves a week with no training as a gap, marked on the date axis', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(1)
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
      const left = Number(bar.getAttribute('x'))
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + Number(bar.getAttribute('width'))).toBeLessThanOrEqual(320)
    }
  })
})

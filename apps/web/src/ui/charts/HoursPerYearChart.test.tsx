// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { THREE_YEARS, yearRow } from '../historyFixtures'
import { HoursPerYearChart } from './HoursPerYearChart'

/** A ResizeObserver that reports the chart at a width, as a browser does on the first measurement. */
function chartWidth(width: number) {
  class SizedObserver {
    callback: ResizeObserverCallback
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

const parts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="year-bar"]'), (bar) =>
    bar.getAttribute('data-sport'),
  )

describe('HoursPerYearChart', () => {
  it('is named by its measure, with one part of a bar for each sport that trained, and the tallest year labelled', () => {
    chartWidth(800)
    const { container } = render(<HoursPerYearChart years={THREE_YEARS} />)
    expect(screen.getByRole('figure', { name: 'Hours per year' })).toBeInTheDocument()
    expect(parts(container)).toEqual(['run', 'ride', 'run', 'run', 'ride'])
    const labels = container.querySelectorAll('[data-testid="year-peak"]')
    expect(labels).toHaveLength(1)
    expect(labels[0]).toHaveTextContent('280.0 h')
  })

  it('reads a year with the keyboard: hours and count for each sport, and the total of two', () => {
    chartWidth(800)
    render(<HoursPerYearChart years={THREE_YEARS} />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'Home' })
    for (const text of ['2021', '120.0 h Run', '90 runs', '40.0 h Ride', '160.0 h Total']) {
      expect(screen.getByRole('status')).toHaveTextContent(text)
    }
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('2022')
    expect(screen.getByRole('status')).not.toHaveTextContent('Total')
  })

  it('keys two sports and, for one, leaves the key out and names the sport in the title', () => {
    chartWidth(800)
    const { rerender } = render(<HoursPerYearChart years={THREE_YEARS} />)
    const items = within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Run', 'Ride'])
    rerender(<HoursPerYearChart years={[yearRow(2024, { hours: 50, activities: 30 })]} />)
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.getByRole('figure', { name: 'Run hours per year' })).toBeInTheDocument()
  })

  it('gives every year in a table, a year with no hours as dashes, and says that year had no training', () => {
    chartWidth(800)
    const years = [
      yearRow(2020, { hours: 10, activities: 5 }),
      yearRow(2021),
      yearRow(2022, {}, { hours: 4, activities: 2 }),
    ]
    render(<HoursPerYearChart years={years} />)
    const table = screen.getByRole('table', { name: 'Hours per year, by sport' })
    const heads = within(table).getAllByRole('columnheader')
    expect(heads.map((th) => th.textContent)).toEqual(['Year', 'Run (h)', 'Ride (h)', 'Total (h)'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['10.0', '—', '10.0'],
      ['—', '—', '—'],
      ['—', '4.0', '4.0'],
    ])
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('2021')
    expect(screen.getByRole('status')).toHaveTextContent('None')
  })

  it('fits a phone: the same bars, and a readout row that says the latest year', () => {
    chartWidth(360)
    const { container } = render(<HoursPerYearChart years={THREE_YEARS} />)
    expect(parts(container)).toHaveLength(5)
    const readout = screen.getByTestId('chart-readout')
    expect(readout.getAttribute('data-idle')).toContain('2023')
  })
})

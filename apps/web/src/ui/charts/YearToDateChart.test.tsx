// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { THIS_YEAR_ONLY, YEAR_TO_DATE } from '../yearToDateFixtures'
import { YearToDateChart } from './YearToDateChart'

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

describe('YearToDateChart', () => {
  it('is named by its finding, with a line for each year and this year drawn in the sport colour', () => {
    chartWidth(800)
    const { container } = render(<YearToDateChart data={YEAR_TO_DATE} units="metric" />)
    expect(screen.getByRole('figure', { name: '2027 is 18 km behind 2025' })).toBeInTheDocument()
    const lines = Array.from(container.querySelectorAll('[data-testid="year-line"]'))
    expect(lines.map((line) => line.getAttribute('data-year'))).toEqual([
      '2024',
      '2025',
      '2026',
      '2027',
    ])
    expect(lines.at(-1)!.getAttribute('class')).toBe('chart-series__line chart-series__line--run')
    expect(lines[0]!.getAttribute('class')).toBe('year-to-date__line')
  })

  it('names the best past year at its line’s end, and this year beside its own', () => {
    chartWidth(800)
    render(<YearToDateChart data={YEAR_TO_DATE} units="metric" />)
    expect(screen.getByTestId('year-label-best')).toHaveTextContent('2025')
    expect(screen.getByTestId('year-label-this')).toHaveTextContent('2027')
  })

  it('gives each year its distance to today and its whole year in a table', () => {
    chartWidth(800)
    render(<YearToDateChart data={YEAR_TO_DATE} units="metric" />)
    const table = screen.getByRole('table', { name: 'Run distance by year' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['61 km', '366 km'],
      ['90 km', '549 km'],
      ['60 km', '366 km'],
      ['72 km', 'In progress'],
    ])
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['2024', '2025', '2026', '2027'])
  })

  it('switches sport with the toggle, and the title, table and lines follow', async () => {
    chartWidth(800)
    const user = userEvent.setup()
    const { container } = render(<YearToDateChart data={YEAR_TO_DATE} units="metric" />)
    await user.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('figure', { name: '2027 is 30 km behind 2025' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Ride distance by year' })).toBeInTheDocument()
    const current = container.querySelector('[data-year="2027"]')
    expect(current?.getAttribute('class')).toBe('chart-series__line chart-series__line--ride')
  })

  it('reads a point with the keyboard: the day, and each year’s distance to it', () => {
    chartWidth(800)
    render(<YearToDateChart data={YEAR_TO_DATE} units="metric" />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'End' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('To 1 Mar')
    for (const text of ['72 km 2027', '60 km 2026', '90 km 2025', '61 km 2024']) {
      expect(status).toHaveTextContent(text)
    }
  })

  it('says what to add for a sport the library has no distance in', async () => {
    chartWidth(800)
    const user = userEvent.setup()
    render(<YearToDateChart data={THIS_YEAR_ONLY} units="imperial" />)
    expect(screen.getByRole('figure', { name: '2027 has 45 mi so far' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('figure', { name: 'No rides in 2027 yet' })).toBeInTheDocument()
    expect(screen.getByText('Add rides to see this chart')).toBeInTheDocument()
    expect(screen.queryByTestId('year-line')).toBeNull()
  })

  it('fits a phone: a readout row that says the latest day', () => {
    chartWidth(360)
    render(<YearToDateChart data={YEAR_TO_DATE} units="metric" />)
    expect(screen.getByTestId('chart-readout').getAttribute('data-idle')).toContain('To 1 Mar')
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { PROFILE, balanceRows, rowOf, TWELVE_YEARS } from '../balanceFixtures'
import { yearViews } from './balanceYears'
import { BalanceOverYearsChart } from './BalanceOverYearsChart'

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

const twelve = yearViews(balanceRows(TWELVE_YEARS), PROFILE, true)
const dots = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="years-dot"]'))
const legend = () =>
  within(screen.getByRole('list', { name: 'Legend' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

describe('BalanceOverYearsChart', () => {
  it('is titled by who led, with a dot for each graded year, hollow where the best was not all out', () => {
    chartWidth(800)
    const { container } = render(<BalanceOverYearsChart views={twelve} />)
    expect(
      screen.getByRole('figure', { name: 'Running led every year until 2019' }),
    ).toBeInTheDocument()
    const all = dots(container)
    expect(all.filter((dot) => dot.getAttribute('data-sport') === 'run')).toHaveLength(11)
    expect(all.filter((dot) => dot.getAttribute('data-sport') === 'ride')).toHaveLength(10)
    const hollow = all.filter((dot) => dot.getAttribute('data-hollow') === 'true')
    expect(hollow.map((dot) => dot.getAttribute('data-sport'))).toEqual(['ride', 'ride', 'ride'])
    expect(legend()).toEqual(['Run', 'Ride, estimated', 'Ride range', 'Best not all out'])
  })

  it('breaks the line at a year with no best, and draws the ride’s range as a band', () => {
    chartWidth(800)
    const { container } = render(<BalanceOverYearsChart views={twelve} />)
    const run = container.querySelector('[data-testid="years-line"][data-sport="run"]')!
    // 2018 has neither sport: the run is drawn in two pieces.
    expect(run.getAttribute('d')!.match(/M/g)).toHaveLength(2)
    expect(container.querySelector('[data-testid="years-band"]')!.getAttribute('d')).toMatch(/^M/)
  })

  it('draws a ride year with no neighbour as its range alone', () => {
    chartWidth(800)
    const views = yearViews(
      [rowOf(2020, 3.6, 3.2), rowOf(2021, 3.7, null), rowOf(2022, 3.8, 3.5)],
      PROFILE,
      true,
    )
    const { container } = render(<BalanceOverYearsChart views={views} />)
    expect(container.querySelectorAll('[data-testid="years-whisker"]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="years-band"]')!.getAttribute('d')).toBe('')
  })

  it('plots what is there for one year, and keys one sport by the title alone', () => {
    chartWidth(800)
    const one = yearViews([rowOf(2022, 3.8, 3.5)], PROFILE, true)
    const { container, rerender } = render(<BalanceOverYearsChart views={one} />)
    expect(screen.getByRole('figure', { name: 'Age grade by year' })).toBeInTheDocument()
    expect(dots(container)).toHaveLength(2)
    const runOnly = yearViews([rowOf(2021, 3.6, null), rowOf(2022, 3.8, null)], PROFILE, true)
    rerender(<BalanceOverYearsChart views={runOnly} />)
    expect(screen.getByRole('figure', { name: 'Running age grade by year' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(dots(container)).toHaveLength(2)
  })

  it('gives the leader of every year in a table, with the effort of a best that was not all out', () => {
    chartWidth(800)
    render(<BalanceOverYearsChart views={twelve} />)
    const table = screen.getByRole('table', {
      name: 'Age grade of the best 20 minutes in each calendar year',
    })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Year', 'Run', 'Ride, estimated', 'Leader'])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        [within(row).getByRole('rowheader').textContent!].concat(
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent!),
        ),
      )
    expect(rows).toHaveLength(12)
    const byYear = new Map(rows.map((row) => [row[0], row]))
    expect(byYear.get('2018')).toEqual(['2018', 'None', 'None', 'None'])
    expect(byYear.get('2016')![3]).toBe('None')
    expect(byYear.get('2014')![3]).toBe('Run')
    expect(byYear.get('2019')![3]).toBe('Level')
    expect(byYear.get('2024')![3]).toBe('Ride')
    // 2019's ride best was held at 120 bpm against a reference of 190.
    expect(byYear.get('2019')![2]).toMatch(/^\d+% \(\d+ to \d+%\), not all out$/)
    expect(byYear.get('2020')![2]).not.toMatch(/not all out/)
  })

  it('reads a year with the keyboard: each sport’s grade and level, the ride’s range, and a best not all out', () => {
    chartWidth(800)
    render(<BalanceOverYearsChart views={twelve} />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'Home' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('2013')
    expect(status).toHaveTextContent('Ride range')
    expect(status).toHaveTextContent('not all out')
  })

  it('fits a phone: the same dots, and a readout row that says the latest year', () => {
    chartWidth(360)
    const { container } = render(<BalanceOverYearsChart views={twelve} />)
    expect(dots(container)).toHaveLength(21)
    expect(screen.getByTestId('chart-readout').getAttribute('data-idle')).toMatch(
      /^Latest: \d+% run, \d+% ride, 2024$/,
    )
  })
})

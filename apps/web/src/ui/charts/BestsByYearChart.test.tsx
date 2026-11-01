// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BestEffort } from '@rca/core/history'
import '../../test/deviceZone'
import { RIDE_BESTS, RUN_BESTS } from '../historyBestsFixtures'
import { BestsByYearChart } from './BestsByYearChart'
import { chartWidth } from './chartSizeStub'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const marks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid^="best-mark"]'))

describe('BestsByYearChart', () => {
  it('is named by its measure, with a panel for each length and a mark for each year that has a best', () => {
    chartWidth(800)
    const { container } = render(
      <BestsByYearChart sport="run" efforts={RUN_BESTS} units="imperial" />,
    )
    expect(screen.getByRole('figure', { name: 'Run bests by year' })).toBeInTheDocument()
    expect(screen.getByText('Pace (/mi), faster up')).toBeInTheDocument()
    const panels = container.querySelectorAll('[data-testid="bests-panel"]')
    expect(Array.from(panels, (panel) => panel.getAttribute('data-length'))).toEqual([
      '1609.344',
      '5000',
      '10000',
    ])
    // Three years of the mile, three of the 5 km and one of the 10 km.
    expect(marks(container)).toHaveLength(7)
  })

  it('draws a best not confirmed hard hollow, and keys the two', () => {
    chartWidth(800)
    const { container } = render(
      <BestsByYearChart sport="run" efforts={RUN_BESTS} units="imperial" />,
    )
    const hollow = marks(container).filter((mark) => mark.getAttribute('data-hollow') === 'true')
    // The mile of 2023 and the 5 km of 2022.
    expect(hollow).toHaveLength(2)
    const key = within(screen.getByRole('list', { name: 'Legend' }))
    expect(key.getByText('Hard effort')).toBeInTheDocument()
    expect(key.getByText('Not confirmed hard')).toBeInTheDocument()
  })

  it('labels the all-time best of each panel, and only that', () => {
    chartWidth(800)
    const { container } = render(
      <BestsByYearChart sport="run" efforts={RUN_BESTS} units="imperial" />,
    )
    const labels = Array.from(
      container.querySelectorAll('[data-testid="best-label"]'),
      (n) => n.textContent,
    )
    // 380 s over a mile, 1440 s over 5 km, 3100 s over 10 km.
    expect(labels).toEqual(['6:20 /mi', '7:43 /mi', '8:19 /mi'])
    expect(container.querySelectorAll('[data-testid="best-mark-top"]')).toHaveLength(3)
  })

  it('reads a year with the keyboard: each length that has a best, the clock time, and what is not confirmed hard', () => {
    chartWidth(800)
    render(<BestsByYearChart sport="run" efforts={RUN_BESTS} units="imperial" />)
    const surface = screen.getByTestId('plot-surface')
    // The second year: a mile that is the all-time best, a 5 km not confirmed hard, and a 10 km.
    fireEvent.keyDown(surface, { key: 'Home' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    for (const text of [
      '2022',
      '6:20 /mi',
      'All-time best',
      '7:47 /mi',
      '24:10, Not confirmed hard',
      '8:19 /mi',
    ]) {
      expect(status).toHaveTextContent(text)
    }
    // A year with none of a length leaves the length out.
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('2023')
    expect(screen.getByRole('status')).not.toHaveTextContent('5 km')
  })

  it('has a table twin of every year, with at least for what is not confirmed hard', () => {
    chartWidth(800)
    render(<BestsByYearChart sport="run" efforts={RUN_BESTS} units="metric" />)
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Year', 'Mile', '5 km', '10 km'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['4:09 /km', '5:00 /km', 'None'],
      ['3:56 /km', 'At least 4:50 /km', '5:10 /km'],
      ['At least 4:02 /km', 'None', 'None'],
      ['None', '4:48 /km', 'None'],
    ])
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['2021', '2022', '2023', '2024'])
  })

  it('follows the units setting', () => {
    chartWidth(800)
    const { rerender } = render(<BestsByYearChart sport="run" efforts={RUN_BESTS} units="metric" />)
    expect(screen.getByText('Pace (/km), faster up')).toBeInTheDocument()
    rerender(<BestsByYearChart sport="run" efforts={RUN_BESTS} units="imperial" />)
    expect(screen.getByText('Pace (/mi), faster up')).toBeInTheDocument()
  })

  it('draws a ride’s power with diamonds, hollow where the 20 minute best is not confirmed hard', () => {
    chartWidth(800)
    const { container } = render(
      <BestsByYearChart sport="ride" efforts={RIDE_BESTS} units="metric" />,
    )
    expect(screen.getByRole('figure', { name: 'Ride bests by year' })).toBeInTheDocument()
    expect(screen.getByText('Power (W)')).toBeInTheDocument()
    const all = marks(container)
    expect(all.map((mark) => mark.getAttribute('data-shape'))).toEqual(Array(4).fill('diamond'))
    expect(all.filter((mark) => mark.getAttribute('data-hollow') === 'true')).toHaveLength(1)
    const labels = Array.from(
      container.querySelectorAll('[data-testid="best-label"]'),
      (n) => n.textContent,
    )
    expect(labels).toEqual(['320 W', '265 W'])
  })

  it('names what a key can say when every best is a floor, and has no key when every best is hard', () => {
    chartWidth(800)
    const floors: BestEffort[] = [
      {
        length: 5000,
        years: [
          [2022, 1500, false],
          [2023, 1490, false],
        ],
      },
    ]
    const { rerender } = render(<BestsByYearChart sport="run" efforts={floors} units="metric" />)
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.getByText('Hollow marks are not confirmed hard')).toBeInTheDocument()
    const hard: BestEffort[] = [
      {
        length: 5000,
        years: [
          [2022, 1500, true],
          [2023, 1490, true],
        ],
      },
    ]
    rerender(<BestsByYearChart sport="run" efforts={hard} units="metric" />)
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.queryByText('Hollow marks are not confirmed hard')).toBeNull()
  })

  it('says what to add when the sport has no best', () => {
    chartWidth(800)
    render(<BestsByYearChart sport="ride" efforts={[]} units="metric" />)
    expect(screen.getByText('Add outdoor rides to see your bests by year')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('fits a phone: every panel and year is still there', () => {
    chartWidth(360)
    const { container } = render(
      <BestsByYearChart sport="run" efforts={RUN_BESTS} units="metric" />,
    )
    expect(container.querySelectorAll('[data-testid="bests-panel"]')).toHaveLength(3)
    expect(marks(container)).toHaveLength(7)
  })
})

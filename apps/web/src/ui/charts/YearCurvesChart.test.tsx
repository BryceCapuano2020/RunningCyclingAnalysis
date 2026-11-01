// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { RIDE_CURVES, RUN_CURVES } from '../historyBestsFixtures'
import { chartWidth } from './chartSizeStub'
import { YearCurvesChart } from './YearCurvesChart'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const lines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid^="year-curve"][data-year]'))

describe('YearCurvesChart', () => {
  it('is titled by its finding, with a line for each year', () => {
    chartWidth(800)
    const { container } = render(
      <YearCurvesChart sport="run" curves={RUN_CURVES} units="imperial" />,
    )
    expect(
      screen.getByRole('figure', { name: 'Your 20 min pace peaked in 2021' }),
    ).toBeInTheDocument()
    expect(lines(container).map((line) => line.getAttribute('data-year'))).toEqual([
      '2020',
      '2022',
      '2021',
      '2023',
    ])
  })

  it('draws the newest year and the best year apart, in the sport colour and named, and the older years under them', () => {
    chartWidth(800)
    const { container } = render(
      <YearCurvesChart sport="run" curves={RUN_CURVES} units="imperial" />,
    )
    const named = container.querySelectorAll('[data-testid="year-curve-named"]')
    expect(Array.from(named, (line) => line.getAttribute('data-year'))).toEqual(['2021', '2023'])
    const labels = Array.from(
      container.querySelectorAll('[data-testid="year-curve-label"]'),
      (n) => n.textContent,
    )
    expect(labels).toEqual(['2021', '2023'])
    // The older years come first in the drawing, so the named ones lie over them.
    const order = lines(container).map((line) => line.getAttribute('data-testid'))
    expect(order).toEqual(['year-curve', 'year-curve', 'year-curve-named', 'year-curve-named'])
  })

  it('fades the older years on one ramp, older fainter', () => {
    chartWidth(800)
    const { container } = render(
      <YearCurvesChart sport="run" curves={RUN_CURVES} units="imperial" />,
    )
    const opacity = (year: string) =>
      Number(
        container
          .querySelector(`[data-testid="year-curve"][data-year="${year}"]`)!
          .getAttribute('stroke-opacity'),
      )
    expect(opacity('2020')).toBeLessThan(opacity('2022'))
    expect(opacity('2020')).toBeGreaterThan(0.2)
    expect(opacity('2022')).toBeLessThan(1)
  })

  it('marks the 20 minute best of each named year, hollow where it is not confirmed hard', () => {
    chartWidth(800)
    const { container } = render(
      <YearCurvesChart sport="run" curves={RUN_CURVES} units="imperial" />,
    )
    const marks = Array.from(container.querySelectorAll('[data-testid="year-curve-mark"]'))
    // 2021 was hard; 2023 was not.
    expect(marks.map((mark) => mark.getAttribute('data-hollow'))).toEqual([null, 'true'])
  })

  it('reads a duration with the keyboard: the named years, and what is not confirmed hard', () => {
    chartWidth(800)
    render(<YearCurvesChart sport="run" curves={RUN_CURVES} units="imperial" />)
    const surface = screen.getByTestId('plot-surface')
    // Home is the shortest duration; two steps on is 20 minutes.
    fireEvent.keyDown(surface, { key: 'Home' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('20 min')
    expect(status).toHaveTextContent('6:23 /mi')
    expect(status).toHaveTextContent('2023')
    expect(status).toHaveTextContent('Not confirmed hard')
  })

  it('has a table twin of every year, newest first, in the units setting', () => {
    chartWidth(800)
    render(<YearCurvesChart sport="ride" curves={RIDE_CURVES} units="metric" />)
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Year', '1 min', '5 min', '20 min', '1 h'])
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['2023', '2022', '2021'])
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('290 W')
  })

  it('draws a ride on a power axis, with its one named year', () => {
    chartWidth(800)
    const { container } = render(
      <YearCurvesChart sport="ride" curves={RIDE_CURVES} units="metric" />,
    )
    expect(
      screen.getByRole('figure', { name: 'Your 20 min power is highest in 2023' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Power (W)')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="year-curve-named"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="year-curve-mark"]')).toHaveLength(1)
  })

  it('says what to add when there is one year or none, and draws nothing', () => {
    chartWidth(800)
    const { container } = render(
      <YearCurvesChart
        sport="ride"
        curves={{ ...RIDE_CURVES, years: RIDE_CURVES.years.slice(0, 1) }}
        units="metric"
      />,
    )
    expect(
      screen.getByText('Add rides from more than one year to compare them'),
    ).toBeInTheDocument()
    expect(lines(container)).toHaveLength(0)
  })

  it('fits a phone: every year is still a line', () => {
    chartWidth(360)
    const { container } = render(<YearCurvesChart sport="run" curves={RUN_CURVES} units="metric" />)
    expect(lines(container)).toHaveLength(4)
  })
})

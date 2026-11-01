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

  it('marks an estimated 20 minute best hollow though it was a hard effort', () => {
    chartWidth(800)
    const estimated = {
      ...RIDE_CURVES,
      years: RIDE_CURVES.years.map((year) => Object.assign({}, year, { estimated: [2] })),
    }
    const { container } = render(<YearCurvesChart sport="ride" curves={estimated} units="metric" />)
    const marks = Array.from(container.querySelectorAll('[data-testid="year-curve-mark"]'))
    expect(marks.map((mark) => mark.getAttribute('data-hollow'))).toEqual(['true'])
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'Home' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Estimated')
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent(
      '290 W, estimated',
    )
  })

  it('says fastest for a pace when the newest year holds the best', () => {
    chartWidth(800)
    const rising = {
      ...RUN_CURVES,
      years: RUN_CURVES.years
        .slice(0, 2)
        .map((year, i) => Object.assign({}, year, { year: 2020 + i })),
    }
    render(<YearCurvesChart sport="run" curves={rising} units="metric" />)
    expect(
      screen.getByRole('figure', { name: 'Your 20 min pace is fastest in 2021' }),
    ).toBeInTheDocument()
  })
})

describe('YearCurvesChart with many years', () => {
  const many = {
    durations: [60, 300, 1200, 3600],
    years: Array.from({ length: 9 }, (_, i) => ({
      year: 2015 + i,
      values: [600 + i, 330 + i, 260 + (i === 3 ? 20 : i), 220 + i],
      hard: true,
      estimated: [],
    })),
  }

  it('draws the newest year, the best year and the two newest others in colour, and the rest grey with no label', () => {
    chartWidth(800)
    const { container } = render(<YearCurvesChart sport="ride" curves={many} units="metric" />)
    const count = (id: string) => container.querySelectorAll(`[data-testid="${id}"]`).length
    // 2023 is the newest and 2018 the best; 2021 and 2022 are the newest of the others.
    expect(count('year-curve-named')).toBe(2)
    expect(count('year-curve-coloured')).toBe(2)
    expect(count('year-curve-grey')).toBe(5)
    const labels = Array.from(
      container.querySelectorAll('[data-testid="year-curve-label"]'),
      (n) => n.textContent,
    )
    expect(labels).toEqual(['2018', '2021', '2022', '2023'])
    expect(screen.getByText('Other years are grey')).toBeInTheDocument()
    // Only the named years carry the 20 minute mark.
    expect(container.querySelectorAll('[data-testid="year-curve-mark"]')).toHaveLength(2)
  })

  it('draws the grey years first and the named years last, so the colour lies over them', () => {
    chartWidth(800)
    const { container } = render(<YearCurvesChart sport="ride" curves={many} units="metric" />)
    const order = Array.from(container.querySelectorAll('[data-year]'), (line) =>
      line.getAttribute('data-testid'),
    )
    expect(order.indexOf('year-curve-named')).toBeGreaterThan(order.lastIndexOf('year-curve-grey'))
    expect(order.indexOf('year-curve-coloured')).toBeGreaterThan(
      order.lastIndexOf('year-curve-grey'),
    )
  })

  it('keeps every year in the table twin', () => {
    chartWidth(800)
    render(<YearCurvesChart sport="ride" curves={many} units="metric" />)
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(9)
  })
})

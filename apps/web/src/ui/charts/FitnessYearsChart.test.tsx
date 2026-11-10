// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { dotsFixture, startOf } from '../test/fitnessYearsFixtures'
import { FitnessYearsChart } from './FitnessYearsChart'

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

const THREE = dotsFixture({ years: [2021, 2022, 2023] })
const dotCount = (d: string | null) => (d?.match(/M/g) ?? []).length

describe('FitnessYearsChart', () => {
  it('is named for what it follows, says what each dot is, and keys the dots and the median', () => {
    chartWidth(800)
    render(<FitnessYearsChart sport="run" dots={THREE} units="metric" />)
    const figure = screen.getByRole('figure', { name: 'Fitness over the years' })
    expect(figure).toHaveTextContent('Pace at 142 bpm on steady runs')
    const items = within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Steady run', 'Median'])
    expect(screen.getByRole('img')).toHaveAccessibleName(
      '120 steady runs from 2021 to 2023, each pace at 142 bpm, with a line through their median.',
    )
  })

  it('draws a dot for every steady run in one node, not a node each', () => {
    chartWidth(800)
    const many = dotsFixture({ years: [2015, 2016, 2017, 2018, 2019, 2020, 2021], perYear: 300 })
    expect(many.levels).toHaveLength(2100)
    const { container } = render(<FitnessYearsChart sport="run" dots={many} units="metric" />)
    const dots = container.querySelectorAll('[data-testid="fitness-dots"]')
    expect(dots).toHaveLength(1)
    expect(dotCount(dots[0]!.getAttribute('d'))).toBe(2100)
    // The whole drawing, axes and all, is a few dozen nodes however many dots there are.
    expect(container.querySelectorAll('svg *').length).toBeLessThan(120)
  })

  it('puts a faster run higher, as the axis says, and a ride’s dots are diamonds on a power axis', () => {
    chartWidth(800)
    const fast = dotsFixture({ years: [2021, 2022], level: (i) => (i < 40 ? 400 : 300) })
    const { container, rerender } = render(
      <FitnessYearsChart sport="run" dots={fast} units="metric" />,
    )
    expect(container.querySelector('svg')).toHaveTextContent('GAP (/km), faster up')
    const d = container.querySelector('[data-testid="fitness-dots"]')!.getAttribute('d')!
    const ys = d
      .split('M')
      .slice(1)
      .map((dot) => Number(dot.split(' ')[1]!.replace('h0', '')))
    expect(ys[0]!).toBeLessThan(ys[79]!)
    const ride = dotsFixture({ sport: 'ride', years: [2021, 2022] })
    rerender(<FitnessYearsChart sport="ride" dots={ride} units="metric" />)
    const diamonds = container.querySelector('[data-testid="fitness-dots"]')!
    expect(diamonds.getAttribute('d')).toContain('Z')
    expect(diamonds).toHaveClass('fitness-years__dots--diamond')
    expect(container.querySelector('svg')).toHaveTextContent('Power (W)')
  })

  it('shades nothing: the plot holds the dots, the median and the axes', () => {
    chartWidth(800)
    const { container } = render(<FitnessYearsChart sport="run" dots={THREE} units="metric" />)
    expect(container.querySelector('[data-testid="fitness-span"]')).toBeNull()
    expect(container).not.toHaveTextContent(/slip|rise/i)
  })

  it('lifts the pen across a gap instead of drawing the median over it', () => {
    chartWidth(800)
    const whole = dotsFixture({ years: [2019, 2020, 2021] })
    const gap = dotsFixture({ years: [2019, 2021] })
    const { container, rerender } = render(
      <FitnessYearsChart sport="run" dots={whole} units="metric" />,
    )
    const pieces = () =>
      (container.querySelector('[data-testid="fitness-median"]')!.getAttribute('d') ?? '').split(
        'M',
      ).length - 1
    expect(pieces()).toBe(1)
    rerender(<FitnessYearsChart sport="run" dots={gap} units="metric" />)
    expect(pieces()).toBe(2)
  })

  it('reads a year with the keyboard: the middle, the middle 80% and the count', () => {
    chartWidth(800)
    render(<FitnessYearsChart sport="run" dots={THREE} units="metric" />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'Home' })
    const status = screen.getByRole('status')
    for (const text of ['2021', 'Pace', '/km', 'Middle 80%', 'Steady runs', '40']) {
      expect(status).toHaveTextContent(text)
    }
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('2022')
    fireEvent.keyDown(surface, { key: 'End' })
    expect(screen.getByRole('status')).toHaveTextContent('2023')
  })

  it('says a year with no steady runs had none, and keeps it in the table as dashes', () => {
    chartWidth(800)
    render(
      <FitnessYearsChart sport="run" dots={dotsFixture({ years: [2019, 2021] })} units="metric" />,
    )
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'Home' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('2020')
    expect(screen.getByRole('status')).toHaveTextContent('None')
    const table = screen.getByRole('table', { name: 'Pace at 142 bpm by year' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      )[1],
    ).toEqual(['None', 'None', '0'])
  })

  it('gives each year in a table, and no second one', () => {
    chartWidth(800)
    render(<FitnessYearsChart sport="run" dots={THREE} units="metric" />)
    const years = screen.getByRole('table', { name: 'Pace at 142 bpm by year' })
    expect(
      within(years)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Year', 'Pace', 'Middle 80%', 'Steady runs'])
    const first = within(years).getAllByRole('row')[1]!
    expect(within(first).getByRole('rowheader')).toHaveTextContent('2021')
    expect(within(first).getAllByRole('cell')[2]).toHaveTextContent('40')
    expect(screen.getAllByRole('table')).toHaveLength(1)
  })

  it('fits a phone with a readout row that says the latest year', () => {
    chartWidth(360)
    render(<FitnessYearsChart sport="run" dots={THREE} units="metric" />)
    expect(screen.getByTestId('chart-readout').getAttribute('data-idle')).toContain('2023')
  })

  it('reads a pace in miles when the athlete counts in miles', () => {
    chartWidth(800)
    const { container } = render(<FitnessYearsChart sport="run" dots={THREE} units="imperial" />)
    expect(container.querySelector('svg')).toHaveTextContent('GAP (/mi), faster up')
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'Home' })
    expect(screen.getByRole('status')).toHaveTextContent('/mi')
  })

  it('reads the year the pointer is in even where a narrow first year has its middle nearer', () => {
    chartWidth(800)
    const shifted = {
      ...dotsFixture({ years: [2020, 2021, 2022] }),
      firstDay: startOf(2020) + 330,
    }
    const { container } = render(<FitnessYearsChart sport="run" dots={shifted} units="metric" />)
    // A tenth of the way into the 2021 room, which is as wide as 2022's: the middle of the narrow 2020 room is nearer.
    const [, mid2021, mid2022] = Array.from(
      container.querySelectorAll('.chart-x-axis__tick'),
      (t) => Number(t.getAttribute('x')),
    )
    const room = mid2022! - mid2021!
    fireEvent.pointerMove(screen.getByTestId('plot-surface'), {
      clientX: mid2021! - 0.4 * room,
      clientY: 100,
    })
    expect(screen.getByRole('status')).toHaveTextContent('2021')
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calendarOf, fiveYearCalendar } from '../calendarFixtures'
import type { DaySpec } from '../calendarFixtures'
import { TrainingCalendarChart } from './TrainingCalendarChart'

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

// Weeks of Monday 1, 8, 15 and 22 January 2024: a run of 1 h, a week of rest, 4 h, and 10 h with a ride of 2 h.
const JANUARY: DaySpec[] = [
  { on: [2024, 1, 2], run: [1, 1] },
  { on: [2024, 1, 17], run: [4, 2] },
  { on: [2024, 1, 24], run: [10, 1], ride: [2, 1] },
]

const steps = () =>
  screen.getAllByTestId('calendar-cell').map((cell) => cell.getAttribute('data-step'))
const status = () => screen.getByRole('status')
/** The drawing alone, whose labels share their text with the tables. */
const drawing = () => within(screen.getByRole('img', { name: /^Heatmap/ }))

describe('TrainingCalendarChart', () => {
  it('draws a cell for each week from the first to the last, tinted by its hours, with a week of rest plain', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    expect(screen.getByRole('figure', { name: 'Training calendar' })).toBeInTheDocument()
    // 1 h, none, 4 h and 12 h a week against a ceiling of 12: steps 1, 0, 2 and 5.
    expect(steps()).toEqual(['1', '0', '2', '5'])
    expect(drawing().getByText('2024')).toBeInTheDocument()
    expect(drawing().getByText('Jan')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-ramp')).toHaveTextContent('None')
    expect(screen.getByTestId('calendar-ramp')).toHaveTextContent('12+ h a week')
  })

  it('leads with the longest streak and the biggest week, from the data', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    const figure = screen.getByRole('figure')
    expect(figure).toHaveTextContent(
      'Your longest streak was 2 weeks, ending the week of 22 Jan 2024. ' +
        'Your biggest week was 12.0 hours, in the week of 22 Jan 2024.',
    )
  })

  it('reads a week with the keyboard: the week, the hours and count of each sport, and the total of two', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'Home' })
    for (const text of ['Week of 1 Jan 2024', '1.0 h Run', '1 run']) {
      expect(status()).toHaveTextContent(text)
    }
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(status()).toHaveTextContent('Week of 8 Jan 2024')
    expect(status()).toHaveTextContent('0 h Training')
    fireEvent.keyDown(surface, { key: 'End' })
    for (const text of ['Week of 22 Jan 2024', '10.0 h Run', '2.0 h Ride', '12.0 h Total']) {
      expect(status()).toHaveTextContent(text)
    }
    fireEvent.keyDown(surface, { key: 'Escape' })
    expect(status()).toBeEmptyDOMElement()
  })

  it('reads the week under the pointer, a pixel of the gap between cells included', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    const third = screen.getAllByTestId('calendar-cell')[2]!
    const x = Number(third.getAttribute('x'))
    const y = Number(third.getAttribute('y'))
    fireEvent.pointerMove(screen.getByTestId('plot-surface'), {
      clientX: x - 0.5,
      clientY: y - 0.5,
    })
    expect(status()).toHaveTextContent('Week of 15 Jan 2024')
    expect(status()).toHaveTextContent('4.0 h Run')
    expect(status()).toHaveTextContent('2 runs')
    fireEvent.pointerMove(screen.getByTestId('plot-surface'), { clientX: 2, clientY: 2 })
    expect(status()).toBeEmptyDOMElement()
  })

  it('keeps a sport with the filter: its own tints and ceiling, its own findings', () => {
    chartWidth(800)
    const { container } = render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual(['all', 'run', 'ride'])
    fireEvent.click(screen.getByLabelText('Ride'))
    expect(container.querySelector('.calendar')).toHaveAttribute('data-sport', 'ride')
    // Two hours of riding in the last week, none before it.
    expect(steps()).toEqual(['0', '0', '0', '5'])
    expect(screen.getByTestId('calendar-ramp')).toHaveTextContent('2+ h a week')
    expect(screen.getByRole('figure')).toHaveTextContent('Your longest riding streak was 1 week')
    fireEvent.click(screen.getByLabelText('Run'))
    expect(steps()).toEqual(['1', '0', '2', '5'])
    expect(screen.getByRole('figure')).toHaveTextContent('Your biggest running week was 10.0 hours')
    fireEvent.click(screen.getByLabelText('All'))
    expect(container.querySelector('.calendar')).not.toHaveAttribute('data-sport')
  })

  it('is named by the sport and has no filter where only one trained', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf([{ on: [2024, 1, 2], ride: [3, 1] }])} />)
    expect(screen.getByRole('figure', { name: 'Ride training calendar' })).toBeInTheDocument()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('gives the hours of every week in a table with a row for each year, and what each year held', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    const table = screen.getByRole('table', { name: 'Hours in each week, by year' })
    const heads = within(table).getAllByRole('columnheader')
    expect(heads).toHaveLength(53)
    expect(heads.slice(0, 4).map((th) => th.textContent)).toEqual(['Year', '1', '2', '3'])
    const row = within(table).getAllByRole('row')[1]!
    const cells = within(row).getAllByRole('cell')
    expect(cells.slice(0, 5).map((c) => c.textContent)).toEqual(['1.0', '0', '4.0', '12.0', ''])
    const summary = screen.getByRole('table', { name: 'Training by year' })
    const year = within(summary).getAllByRole('row')[1]!
    expect(within(year).getByRole('rowheader')).toHaveTextContent('2024')
    // Three weeks with training, 17 hours of it, in five activities.
    expect(
      within(year)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['3', '17.0', '5'])
  })

  it('puts the week that spans New Year in one cell of the new year, and a long year in 53 columns', () => {
    chartWidth(800)
    render(
      <TrainingCalendarChart
        calendar={calendarOf([
          { on: [2020, 12, 29], run: [1, 1] },
          { on: [2021, 1, 4], run: [2, 1] },
        ])}
      />,
    )
    // The week of Monday 28 December 2020 has its Thursday in 2020, and is that year's 53rd.
    expect(drawing().getByText('2020')).toBeInTheDocument()
    expect(drawing().getByText('2021')).toBeInTheDocument()
    expect(steps()).toHaveLength(2)
    const table = screen.getByRole('table', { name: 'Hours in each week, by year' })
    const [first, second] = within(table).getAllByRole('row').slice(1)
    expect(within(first!).getAllByRole('cell')[52]).toHaveTextContent('1.0')
    expect(within(second!).getAllByRole('cell')[0]).toHaveTextContent('2.0')
  })

  it('lays out by the month on a phone, a month’s tint the hours in its average week', () => {
    chartWidth(360)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    // One cell: January 2024 held these four weeks (Thursdays the 4th, 11th, 18th and 25th), 17 h or 4.25 h a week.
    expect(steps()).toHaveLength(1)
    expect(screen.getByRole('table', { name: 'Hours in each month, by year' })).toBeInTheDocument()
    const heads = within(
      screen.getByRole('table', { name: 'Hours in each month, by year' }),
    ).getAllByRole('columnheader')
    expect(heads.map((th) => th.textContent)).toEqual([
      'Year',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'Home' })
    for (const text of ['Jan 2024', '15.0 h Run', '2.0 h Ride', '17.0 h Total', '3 of 4']) {
      expect(status()).toHaveTextContent(text)
    }
  })

  it('shows the latest week in the phone’s readout row until one is selected', () => {
    chartWidth(360)
    render(<TrainingCalendarChart calendar={calendarOf(JANUARY)} />)
    expect(screen.getByTestId('chart-readout').getAttribute('data-idle')).toContain('Jan 2024')
  })

  it('draws the whole of a long library, with a gap that is plain cells between tinted ones', () => {
    chartWidth(1000)
    render(<TrainingCalendarChart calendar={fiveYearCalendar()} />)
    const all = steps()
    expect(all).toHaveLength(5 * 52)
    const quiet = all.slice(2 * 52 + 24, 2 * 52 + 32)
    expect(quiet).toEqual(Array(8).fill('0'))
    expect(all.filter((step) => step !== '0').length).toBe(all.length - 8)
    expect(drawing().getAllByText(/^20(19|2[0-3])$/)).toHaveLength(5)
  })

  it('says what to add where the library holds no training', () => {
    chartWidth(800)
    render(<TrainingCalendarChart calendar={calendarOf([])} />)
    expect(screen.getByText('Add runs or rides to see your training calendar.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('calendar-cell')).toHaveLength(0)
    expect(screen.queryByTestId('calendar-ramp')).toBeNull()
  })
})

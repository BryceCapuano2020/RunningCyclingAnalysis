// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TrendPoint } from '@rca/core/digest'
import { TrendChart } from './TrendChart'

const TITLE = 'Fitness over time'
const WEEK_MS = 7 * 86_400_000

/** Sunday 12 January 2025, 23:59:59.999 UTC: the end of the first week. */
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

function point(week: number, runWkg: number | null, rideWkg: number | null): TrendPoint {
  return {
    endMs: FIRST_END + week * WEEK_MS,
    runWkg,
    rideWkg,
    runCount: runWkg === null ? 0 : 2,
    rideCount: rideWkg === null ? 0 : 1,
  }
}

/** Six weeks; running has a gap in weeks 2 and 3, and cycling starts in week 4. */
const POINTS: TrendPoint[] = [
  point(0, 14.5, null),
  point(1, 14.7, 14.1),
  point(2, null, 14.2),
  point(3, null, 14.4),
  point(4, 15.0, 14.6),
  point(5, 15.1, 14.8),
]

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('TrendChart', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws the titled chart with a legend for both sports', () => {
    render(<TrendChart points={POINTS} />)
    expect(screen.getByRole('img', { name: new RegExp(`^${TITLE}`) })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Running')).toBeInTheDocument()
    expect(within(legend).getByText('Cycling')).toBeInTheDocument()
  })

  it('labels the date axis with month ticks in UTC', () => {
    const { container } = render(<TrendChart points={POINTS} />)
    const ticks = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (t) => t.textContent,
    )
    expect(ticks).toEqual(['Feb 2025'])
  })

  it('draws a marker for each value and breaks the line at gaps', () => {
    const { container } = render(<TrendChart points={POINTS} />)
    const markers = screen.getAllByTestId('trend-marker')
    expect(markers.filter((m) => m.getAttribute('data-series') === 'run')).toHaveLength(4)
    expect(markers.filter((m) => m.getAttribute('data-series') === 'ride')).toHaveLength(5)

    const runLine = container.querySelector('[data-testid="trend-line"][data-series="run"]')
    // Two runs of values, so the pen is lifted once between them: two moveto commands.
    expect(runLine?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    const rideLine = container.querySelector('[data-testid="trend-line"][data-series="ride"]')
    expect(rideLine?.getAttribute('d')?.match(/M/g)).toHaveLength(1)
  })

  it('describes the plot surface with a tooltip', () => {
    render(<TrendChart points={POINTS} />)
    const plot = screen.getByTestId('plot-surface')
    expect(plot).toHaveAttribute('tabindex', '0')
    const describedBy = plot.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy ?? '')).toHaveAttribute('role', 'status')
  })

  it('shows the week and both values when the arrow keys move the active point', () => {
    render(<TrendChart points={POINTS} />)
    const plot = screen.getByTestId('plot-surface')
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Jan 12, 2025')
    expect(screen.getByRole('status')).toHaveTextContent('14.5 W/kg')
    expect(screen.getByRole('status')).toHaveTextContent('No rides in the previous 6 weeks')

    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Jan 19, 2025')
    expect(screen.getByRole('status')).toHaveTextContent('14.1 W/kg')

    fireEvent.keyDown(plot, { key: 'Escape' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('lists every week in the table view, with a dash where a sport has no value', () => {
    const { container } = render(<TrendChart points={POINTS} />)
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Week ending', 'Running (W/kg)', 'Runs', 'Cycling (W/kg)', 'Rides'])
    expect(rows).toHaveLength(6)
    expect(rows[0]).toEqual(['Jan 12, 2025', '14.5 W/kg', '2', '—', '0'])
    expect(rows[2]).toEqual(['Jan 26, 2025', '—', '0', '14.2 W/kg', '1'])
  })

  it('shows an empty state when fewer than two weeks have a run or ride value', () => {
    render(<TrendChart points={[point(0, 14, null), point(1, null, null), point(2, null, null)]} />)
    expect(screen.queryByRole('img', { name: new RegExp(`^${TITLE}`) })).toBeNull()
  })

  it('shows an empty state with fewer than two weeks', () => {
    render(<TrendChart points={[point(0, 14, 14)]} />)
    expect(screen.queryByRole('img', { name: new RegExp(`^${TITLE}`) })).toBeNull()
    expect(
      screen.getByText('Add runs and rides in more than one week to see a trend'),
    ).toBeInTheDocument()
  })
})

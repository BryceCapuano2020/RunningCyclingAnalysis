// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { HrCrossCheck } from '../../core/types'
import { hrFixture, hrRunOnlyFixture } from './fixtures'
import { HrScatter } from './HrScatter'

const TITLE = 'Heart rate against gross metabolic power'

/** The static chart image is named by its title, then its description. */
const named = (title: string) => (name: string) => name.startsWith(title)
const EMPTY =
  'Not enough steady heart-rate data yet. It takes roughly 8 five-minute blocks per sport across a range of efforts'

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('HrScatter', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws a dot per block, a fitted line per sport, and the legend', () => {
    render(<HrScatter hr={hrFixture} />)
    expect(screen.getByRole('img', { name: named(TITLE) })).toBeInTheDocument()
    expect(screen.getAllByTestId('hr-dot')).toHaveLength(5)
    expect(screen.getAllByTestId('hr-fit')).toHaveLength(2)
    expect(screen.queryByText(/Not enough steady/)).toBeNull()
    expect(
      screen.getByText('Slopes: running 10.0 and cycling 12.0 bpm per W/kg'),
    ).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend).toHaveTextContent('Running')
    expect(legend).toHaveTextContent('Cycling')
  })

  it('formats the table view with block counts, slopes and R squared', () => {
    const { container } = render(<HrScatter hr={hrFixture} />)
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Sport', 'Blocks', 'Slope (bpm per W/kg)', 'R squared'])
    expect(rows).toEqual([
      ['Running', '3', '10.0', '0.95'],
      ['Cycling', '2', '12.0', '0.90'],
    ])
  })

  it('shows the nearest dot when the arrow keys move', () => {
    render(<HrScatter hr={hrFixture} />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('Running')
    expect(tooltip).toHaveTextContent('13.5 W/kg')
    expect(tooltip).toHaveTextContent('150 bpm')
  })

  it('draws the sport that has data and names the missing one', () => {
    render(<HrScatter hr={hrRunOnlyFixture} />)
    expect(screen.getAllByTestId('hr-dot')).toHaveLength(3)
    expect(screen.getAllByTestId('hr-fit')).toHaveLength(1)
    expect(
      screen.getByText(
        'Not enough steady heart-rate data for cycling yet, so only running is shown.',
      ),
    ).toBeInTheDocument()
  })

  it('lists only the sports that are drawn, so one sport has no legend', () => {
    render(<HrScatter hr={hrRunOnlyFixture} />)
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('gives distinct tick labels when the data span is narrow', () => {
    const narrow: HrCrossCheck = {
      run: {
        points: [
          { metabolicPower: 14, heartRate: 150, activityId: 'run-1' },
          { metabolicPower: 14.05, heartRate: 155, activityId: 'run-1' },
          { metabolicPower: 14.1, heartRate: 160, activityId: 'run-1' },
        ],
        fit: { slope: 100, intercept: -1250, slopeSe: 1, r2: 0.9, n: 3 },
      },
      ride: null,
      kappa: null,
      lnKappaSe: null,
    }
    const { container } = render(<HrScatter hr={narrow} />)
    const labels = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(labels).toContain('14.02')
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('shows an empty state when neither sport has enough data', () => {
    render(<HrScatter hr={{ run: null, ride: null, kappa: null, lnKappaSe: null }} />)
    expect(screen.getByText(EMPTY)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: named(TITLE) })).toBeNull()
  })
})

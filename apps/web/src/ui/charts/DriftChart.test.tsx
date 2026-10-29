// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { driftPoints } from '../lateFixtures'
import { DECOUPLING_REFERENCE, driftDescription } from '../lateInEffort'
import { DriftChart } from './DriftChart'

const NOTE = 'How a dot is made.'
const TAKEAWAY = 'Output per heartbeat fell 3% from the first half to the second.'
const POINTS = driftPoints([1, 2, 3, 6, 4])
const NAMES = Object.fromEntries(POINTS.map((p, i) => [p.activityId, `Long run ${i + 1}`]))

describe('DriftChart', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 10))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const renderChart = (sport: 'run' | 'ride' = 'run') =>
    render(
      <DriftChart
        sport={sport}
        points={POINTS}
        names={NAMES}
        takeaway={TAKEAWAY}
        medianPct={3}
        note={NOTE}
      />,
    )

  it('is titled for the sport’s steady efforts', () => {
    renderChart()
    expect(
      screen.getByRole('figure', {
        name: 'Change in output per heartbeat on steady runs, first half to second',
      }),
    ).toBeInTheDocument()
    cleanup()
    renderChart('ride')
    expect(
      screen.getByRole('figure', {
        name: 'Change in output per heartbeat on steady rides, first half to second',
      }),
    ).toBeInTheDocument()
  })

  it('draws a dot for each effort, with no line between them', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="drift-dot"]')).toHaveLength(5)
    expect(container.querySelector('path.chart-series__line--run')).toBeNull()
  })

  it.each(['run', 'ride'] as const)(
    'describes %s drift in grammatical sentences, with the reference in lower case mid-sentence',
    (sport) => {
      expect(driftDescription(sport)).toBe(
        `One dot for each steady ${sport} over an hour: the percent its output per heartbeat changed from the first half to the second, by date, a fall being below zero. A dashed line marks a fall of 5%: under this is usually read as well-built endurance.`,
      )
    },
  )

  it('sets the finding as the chart’s headline', () => {
    renderChart()
    expect(screen.getByRole('figure')).toHaveAccessibleDescription(TAKEAWAY)
  })

  it('draws the median as a line across the dots, below zero for a fall, and says it in words', () => {
    const { container } = renderChart()
    const median = container.querySelector('[data-testid="drift-median"]')!
    // The axis has zero above the 5% reference: a 3% fall sits between them.
    const zero = Number(
      container.querySelector('[data-testid="drift-reference"]')!.getAttribute('y1'),
    )
    const y = Number(median.getAttribute('y1'))
    expect(y).toBe(Number(median.getAttribute('y2')))
    expect(y).toBeLessThan(zero)
    expect(container.querySelector('.drift-chart__median-label')?.textContent).toBe(
      'Median: fell 3%',
    )
  })

  it('keeps the median on the axis when it is the furthest value, and draws no NaN', () => {
    const { container } = render(
      <DriftChart
        sport="run"
        points={POINTS}
        names={NAMES}
        takeaway={TAKEAWAY}
        medianPct={30}
        note={NOTE}
      />,
    )
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    const ticks = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map((t) =>
      Number.parseInt(t.textContent ?? '', 10),
    )
    expect(Math.min(...ticks)).toBeLessThanOrEqual(-30)
  })

  it('draws the 5% reference as a dashed line named plainly in the key', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="drift-reference"]')).toHaveLength(1)
    expect(screen.getByText(DECOUPLING_REFERENCE)).toBeInTheDocument()
  })

  it('puts a fall below zero, a bigger fall lower, and the 5% fall line between the 4% and the 6% dots', () => {
    const { container } = renderChart()
    const dots = Array.from(container.querySelectorAll('[data-testid="drift-dot"]')).map((d) =>
      Number(d.getAttribute('cy')),
    )
    const reference = Number(
      container.querySelector('[data-testid="drift-reference"]')!.getAttribute('y1'),
    )
    // SVG y grows downwards: the 6% fall (index 3) is below the 5% line, the 4% fall (index 4) above it.
    expect(dots[3]).toBeGreaterThan(reference)
    expect(dots[4]).toBeLessThan(reference)
    expect(dots[3]).toBeGreaterThan(dots[0]!)
  })

  it('draws a rise above zero and reads it as a rise', () => {
    const rising = driftPoints([-3, 2, 4])
    const { container } = render(
      <DriftChart
        sport="run"
        points={rising}
        names={{}}
        takeaway={TAKEAWAY}
        medianPct={3}
        note={NOTE}
      />,
    )
    const [rise, fall] = Array.from(container.querySelectorAll('[data-testid="drift-dot"]')).map(
      (d) => Number(d.getAttribute('cy')),
    )
    expect(rise).toBeLessThan(fall!)
    expect(container.querySelector('.chart-y-axis__title')?.textContent).toBe(
      'Change in output per heartbeat (%)',
    )
    expect(within(screen.getByRole('table')).getByText('Rose 3%')).toBeInTheDocument()
  })

  it('keeps zero on the axis, so a small fall is read against it', () => {
    const { container } = renderChart()
    const labels = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (t) => t.textContent,
    )
    expect(labels).toContain('0%')
    expect(labels).toContain('-6%')
  })

  it('names the effort and its change in a tooltip when a point is read with the arrow keys', () => {
    renderChart()
    const plot = screen.getByTestId('plot-surface')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Long run 1')
    expect(status).toHaveTextContent('Output per heartbeat fell 1%')
    expect(status).toHaveTextContent('1 h 10 min of moving time')
  })

  it('lists each effort in a table with its date, name, change and moving time', () => {
    renderChart()
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Date', 'Activity', 'Change', 'Moving time'])
    const first = within(table).getAllByRole('row')[1]!
    expect(Array.from(first.querySelectorAll('th, td')).map((c) => c.textContent)).toEqual([
      expect.stringMatching(/^Mon 6 Jan 2025$/),
      'Long run 1',
      'Fell 1%',
      '1 h 10 min',
    ])
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('falls back to the date when an activity has no name', () => {
    render(
      <DriftChart
        sport="run"
        points={POINTS}
        names={{}}
        takeaway={TAKEAWAY}
        medianPct={3}
        note={NOTE}
      />,
    )
    const first = within(screen.getByRole('table')).getAllByRole('row')[1]!
    expect(first.querySelectorAll('th, td')[1]!.textContent).toBe('Mon 6 Jan 2025')
  })

  it('draws on one day without a repeated tick', () => {
    const same = POINTS.map((p) => Object.assign({}, p, { startMs: POINTS[0]!.startMs }))
    const { container } = render(
      <DriftChart
        sport="run"
        points={same}
        names={NAMES}
        takeaway={TAKEAWAY}
        medianPct={3}
        note={NOTE}
      />,
    )
    expect(container.querySelectorAll('.chart-x-axis__tick')).toHaveLength(1)
  })
})

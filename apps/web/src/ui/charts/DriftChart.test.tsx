// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { driftPoints } from '../lateFixtures'
import { DECOUPLING_REFERENCE } from '../lateInEffort'
import { DriftChart } from './DriftChart'

const NOTE = 'How a dot is made.'
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
    render(<DriftChart sport={sport} points={POINTS} names={NAMES} note={NOTE} />)

  it('is titled for the sport’s steady efforts', () => {
    renderChart()
    expect(
      screen.getByRole('figure', {
        name: 'Fall in output per heartbeat on steady runs, first half to second',
      }),
    ).toBeInTheDocument()
    cleanup()
    renderChart('ride')
    expect(
      screen.getByRole('figure', {
        name: 'Fall in output per heartbeat on steady rides, first half to second',
      }),
    ).toBeInTheDocument()
  })

  it('draws a dot for each effort, with no line between them', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="drift-dot"]')).toHaveLength(5)
    expect(container.querySelector('path.chart-series__line--run')).toBeNull()
  })

  it('draws the 5% reference as a dashed line named plainly in the key', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('[data-testid="drift-reference"]')).toHaveLength(1)
    expect(screen.getByText(DECOUPLING_REFERENCE)).toBeInTheDocument()
  })

  it('puts a bigger fall higher, and the reference between the 4% and the 6% dots', () => {
    const { container } = renderChart()
    const dots = Array.from(container.querySelectorAll('[data-testid="drift-dot"]')).map((d) =>
      Number(d.getAttribute('cy')),
    )
    const reference = Number(
      container.querySelector('[data-testid="drift-reference"]')!.getAttribute('y1'),
    )
    // SVG y grows downwards: the 6% dot (index 3) is above the reference, the 4% dot (index 4) below it.
    expect(dots[3]).toBeLessThan(reference)
    expect(dots[4]).toBeGreaterThan(reference)
    expect(dots[3]).toBeLessThan(dots[0]!)
  })

  it('keeps zero on the axis, so a small fall is read against it', () => {
    const { container } = renderChart()
    const labels = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (t) => t.textContent,
    )
    expect(labels).toContain('0%')
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
    render(<DriftChart sport="run" points={POINTS} names={{}} note={NOTE} />)
    const first = within(screen.getByRole('table')).getAllByRole('row')[1]!
    expect(first.querySelectorAll('th, td')[1]!.textContent).toBe('Mon 6 Jan 2025')
  })

  it('draws on one day without a repeated tick', () => {
    const same = POINTS.map((p) => Object.assign({}, p, { startMs: POINTS[0]!.startMs }))
    const { container } = render(<DriftChart sport="run" points={same} names={NAMES} note={NOTE} />)
    expect(container.querySelectorAll('.chart-x-axis__tick')).toHaveLength(1)
  })
})

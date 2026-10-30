// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FITNESS_BEFORE, HOLDING, RECOVERING, SLIPPING, fitnessStatus } from '../fitnessFixtures'
import { FitnessChart } from './FitnessChart'

afterEach(cleanup)

const tableOf = (container: HTMLElement) => ({
  headers: Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent),
  rows: Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  ),
})

describe('FitnessChart', () => {
  it('is named by what it plots, at the reference heart rate, and described in words', () => {
    render(<FitnessChart status={SLIPPING} units="metric" />)
    const figure = screen.getByRole('figure', { name: 'Pace at 150 bpm over time' })
    expect(figure).toBeInTheDocument()
    expect(within(figure).getByRole('img').getAttribute('aria-label')).toMatch(
      /^Flat pace at 150 bpm at four-week steps, each with its 90% range, against the level before the change began in February and the level now\.$/,
    )
  })

  it('draws a hollow ring and a shaded range for each step, and the largest ring for now', () => {
    const { container } = render(<FitnessChart status={SLIPPING} units="metric" />)
    expect(container.querySelectorAll('[data-testid="fitness-point"]')).toHaveLength(13)
    expect(container.querySelectorAll('[data-testid="fitness-now"]')).toHaveLength(1)
    const point = container.querySelector('[data-testid="fitness-point"]')!
    const now = container.querySelector('[data-testid="fitness-now"]')!
    expect(point).toHaveClass('chart-series__ring--run')
    expect(Number(now.getAttribute('r'))).toBeGreaterThan(Number(point.getAttribute('r')))
    expect(container.querySelector('[data-testid="fitness-band"]')?.getAttribute('d')).not.toBe('')
    expect(container.querySelector('[data-testid="fitness-line"]')).not.toBeNull()
  })

  it('labels the level before the change as a line, and the value now at the end of the line', () => {
    const { container } = render(<FitnessChart status={SLIPPING} units="metric" />)
    expect(container.querySelector('[data-annotation="before"]')?.textContent).toMatch(
      /^Before February.*5:03 \/km$/,
    )
    expect(container.querySelector('[data-annotation="now"]')?.textContent).toMatch(/\/km.*now/)
  })

  it('marks the month the change began with a rule, and none for a status without one', () => {
    const slipping = render(<FitnessChart status={SLIPPING} units="metric" />)
    expect(slipping.container.querySelector('[data-testid="fitness-onset"]')?.textContent).toBe(
      'Began February',
    )
    slipping.unmount()
    const holding = render(<FitnessChart status={HOLDING} units="metric" />)
    expect(holding.container.querySelector('[data-testid="fitness-onset"]')).toBeNull()
    expect(holding.container.querySelector('[data-annotation="before"]')?.textContent).toMatch(
      /^Earlier level/,
    )
  })

  it('names the year of a change that began in an earlier year, and draws no rule where the chart starts after it', () => {
    const old = fitnessStatus('recovering', (i) => 0.01 * i, {
      onsetMs: Date.UTC(2022, 7, 1),
      gain: RECOVERING.gain,
    })
    const { container } = render(<FitnessChart status={old} units="metric" />)
    expect(container.querySelector('[data-testid="fitness-onset"]')).toBeNull()
    expect(container.querySelector('[data-annotation="before"]')?.textContent).toMatch(
      /^Before August 2022/,
    )
  })

  it('has a table twin with a row for each step and one for the level before, the month it began and now', () => {
    const { container } = render(<FitnessChart status={SLIPPING} units="metric" />)
    const [summary, steps] = [
      ...container.querySelectorAll('.chart-frame__details table'),
    ] as HTMLElement[]
    expect(summary).toBeDefined()
    const level = tableOf(summary!.parentElement!)
    expect(level.rows[0]).toEqual(['Before February', '5:03 /km'])
    expect(level.rows[1]).toEqual(['Change began', 'February 2026'])
    expect(level.rows[2]![0]).toBe('Now')
    expect(steps).toBeDefined()
    const { headers, rows } = tableOf(container)
    expect(headers).toContain('90% range')
    expect(rows.filter((row) => row.length === 4)).toHaveLength(14)
    expect(screen.getByText('View as table')).toBeInTheDocument()
  })

  it('reads the line as faster up: a slip ends lower on the page than it began', () => {
    const { container } = render(<FitnessChart status={SLIPPING} units="metric" />)
    const ys = (
      container
        .querySelector('[data-testid="fitness-line"]')!
        .getAttribute('d')!
        .match(/-?[\d.]+ (-?[\d.]+)/g) ?? []
    ).map((pair) => Number(pair.split(' ')[1]))
    expect(ys.at(-1)!).toBeGreaterThan(ys[0]!)
  })

  it('says so rather than drawing from fewer than two steps', () => {
    render(
      <FitnessChart status={fitnessStatus('slipping', () => 0, { series: [] })} units="metric" />,
    )
    expect(screen.getByText('Not enough steps to draw')).toBeInTheDocument()
    expect(FITNESS_BEFORE).toBeGreaterThan(0)
  })
})

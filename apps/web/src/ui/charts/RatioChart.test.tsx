// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { comparisonFixture } from './fixtures'
import { comparisonPoint, interval } from '../components/fixtures'
import { RatioChart } from './RatioChart'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const ratioCss = await readStylesheet(import.meta.url, './RatioChart.css')

/** The declarations of one rule in RatioChart.css, by exact selector. */
function cssRule(selector: string): string {
  return ruleBody(ratioCss, selector)
}

const TITLE = 'Run compared with Ride by duration'

/** The chart's figure is named by its visible title. */
function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('RatioChart', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws the prior band and its median when there is no heart-rate check', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(false)} />)
    expect(screen.getByRole('figure', { name: TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.getAllByTestId('ratio-band')).toHaveLength(1)
    expect(screen.getAllByTestId('ratio-median')).toHaveLength(1)
    // The zero tick on the axis reads Even; the table says Even for its own row.
    expect(screen.getByText('Even', { selector: 'text' })).toBeInTheDocument()
    expect(screen.getByText('Higher Run energy rate')).toBeInTheDocument()
    expect(screen.getByText('Higher Ride energy rate')).toBeInTheDocument()

    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Reading', 'Median', '90% range'])
    expect(rows).toEqual([
      ['1 min', 'Even', '0%', '-8% to +10%'],
      ['5 min', 'Running 8% higher than cycling', '+8%', '+2% to +14%'],
      ['20 min', 'Running 3% higher than cycling', '+3%', '-2% to +9%'],
    ])
  })

  it('layers the calibrated band over the prior one and adds both legend entries', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(true)} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Before heart-rate check: 90% range')).toBeInTheDocument()
    expect(within(legend).getByText('After heart-rate check: 90% range')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Above the line, your running is higher than your cycling at that duration; below it, your cycling is higher. Shading shows the 90% range. The line is the middle estimate.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('ratio-band')).toHaveLength(2)
    expect(screen.getAllByTestId('ratio-median')).toHaveLength(1)

    const { headers, rows } = tableOf(container)
    expect(headers).toEqual([
      'Duration',
      'Reading',
      'Median',
      '90% range',
      'Prior median',
      'Prior 90% range',
    ])
    expect(rows[1]).toEqual([
      '5 min',
      'Running 5% higher than cycling',
      '+5%',
      '0% to +10%',
      '+8%',
      '+2% to +14%',
    ])
  })

  it('shows the median and range for a duration when the arrow keys move', () => {
    render(<RatioChart comparison={comparisonFixture(false)} />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('1 min')
    expect(tooltip).toHaveTextContent('0% median')
    expect(tooltip).toHaveTextContent('-8% to +10% 90% range')
  })

  it('shows an empty state when there are no comparison points', () => {
    const { container } = render(<RatioChart comparison={{ prior: [], calibrated: null }} />)
    expect(
      screen.getByText('Add at least one run and one ride to compare them.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('.chart-frame__legend')).toBeNull()
  })

  it('names the zero line on the axis, outside the plot, so it does not sit on the bands', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(false)} />)
    const even = screen.getByText('Even', { selector: 'text' })
    expect(even).toHaveClass('chart-y-axis__tick')
    expect(container.querySelectorAll('.ratio-chart__label').length).toBeGreaterThan(0)
    expect(
      Array.from(container.querySelectorAll('.ratio-chart__label')).map((el) => el.textContent),
    ).not.toContain('Even')
  })

  it('distinguishes the two bands by outline as well as fill, so fill alone carries no meaning', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(true)} />)
    const prior = container.querySelector('.ratio-chart__band--prior')
    const calibrated = container.querySelector('.ratio-chart__band--calibrated')
    expect(prior).not.toBeNull()
    expect(calibrated).not.toBeNull()

    const calibratedRule = cssRule('.ratio-chart__band--calibrated')
    expect(calibratedRule).toMatch(/stroke:\s*var\(--neutral-mark\)/)
    expect(calibratedRule).toMatch(/stroke-width:\s*1\.5px/)
    expect(cssRule('.ratio-chart__band--prior')).toMatch(/stroke-dasharray/)
  })

  it('labels the percentage axis with what the signs mean', () => {
    render(<RatioChart comparison={comparisonFixture(false)} />)
    expect(screen.getByText('Run above (+) or below (−) Ride, %')).toBeInTheDocument()
  })

  it('tints the running side coral above the line and the cycling side blue below it', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(false)} />)
    const tints = screen.getAllByTestId('ratio-higher')
    expect(tints).toHaveLength(2)
    const [running, cycling] = tints
    expect(running).toHaveClass('ratio-chart__higher--run')
    expect(cycling).toHaveClass('ratio-chart__higher--ride')
    // Running's tint ends where the line of equal energy rate sits, and cycling's starts there.
    const zero = container.querySelector('.ratio-chart__zero')
    expect(
      Number(running?.getAttribute('y')) + Number(running?.getAttribute('height')),
    ).toBeCloseTo(Number(zero?.getAttribute('y1')), 5)
    expect(cycling?.getAttribute('y')).toBe(zero?.getAttribute('y1'))
  })

  it('fills each tint with its sport’s soft series token, not a raw colour', () => {
    expect(cssRule('.ratio-chart__higher--run')).toContain('var(--series-run-soft)')
    expect(cssRule('.ratio-chart__higher--ride')).toContain('var(--series-ride-soft)')
  })

  it('says in the caption, and in each table row, which sport is higher', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(false)} />)
    expect(
      screen.getByText(
        /Above the line, your running is higher than your cycling at that duration; below it, your cycling is higher\./,
      ),
    ).toBeInTheDocument()
    expect(tableOf(container).rows.map((row) => row[1])).toEqual([
      'Even',
      'Running 8% higher than cycling',
      'Running 3% higher than cycling',
    ])
  })

  it('reads a median below equal as cycling higher, by how much', () => {
    const comparison = {
      prior: [comparisonPoint({ durationS: 300, ratio: interval(0.85, 0.92, 0.98) })],
      calibrated: null,
    }
    const { container } = render(<RatioChart comparison={comparison} />)
    expect(tableOf(container).rows[0]?.[1]).toBe('Cycling 8% higher than running')
  })
})

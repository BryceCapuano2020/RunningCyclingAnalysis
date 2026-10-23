// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { comparisonFixture } from './fixtures'
import { RatioChart } from './RatioChart'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const ratioCss = await readStylesheet(import.meta.url, './RatioChart.css')

/** The declarations of one rule in RatioChart.css, by exact selector. */
function cssRule(selector: string): string {
  return ruleBody(ratioCss, selector)
}

const TITLE = 'Running compared with cycling by duration'

/** The static chart image is named by its title, then its description. */
const named = (title: string) => (name: string) => name.startsWith(title)

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('RatioChart', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws the prior band and its median when there is no heart-rate check', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(false)} />)
    expect(screen.getByRole('img', { name: named(TITLE) })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.getAllByTestId('ratio-band')).toHaveLength(1)
    expect(screen.getAllByTestId('ratio-median')).toHaveLength(1)
    expect(screen.getByText('Equal')).toBeInTheDocument()
    expect(screen.getByText('Higher running energy rate')).toBeInTheDocument()
    expect(screen.getByText('Higher cycling energy rate')).toBeInTheDocument()

    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Median', '90% range'])
    expect(rows).toEqual([
      ['1 min', '0%', '-8% to +10%'],
      ['5 min', '+8%', '+2% to +14%'],
      ['20 min', '+3%', '-2% to +9%'],
    ])
  })

  it('layers the calibrated band over the prior one and adds both legend entries', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(true)} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Before heart-rate check')).toBeInTheDocument()
    expect(within(legend).getByText('After heart-rate check')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Shading shows the 90% model range; other errors are not included. The line is the median',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('ratio-band')).toHaveLength(2)
    expect(screen.getAllByTestId('ratio-median')).toHaveLength(1)

    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Median', '90% range', 'Prior median', 'Prior 90% range'])
    expect(rows[1]).toEqual(['5 min', '+5%', '0% to +10%', '+8%', '+2% to +14%'])
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
    render(<RatioChart comparison={{ prior: [], calibrated: null }} />)
    expect(
      screen.getByText('Add at least one run and one ride to compare them'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: named(TITLE) })).toBeNull()
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
    expect(screen.getByText('Running above (+) or below (−) cycling, %')).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RUN_YEARS } from '../yearsFixtures'
import { YearsChart } from './YearsChart'

afterEach(cleanup)

describe('YearsChart', () => {
  it('is named by what it plots and described in words, with the years it covers', () => {
    render(<YearsChart sport="run" years={RUN_YEARS} referenceHr={148} units="metric" />)
    const figure = screen.getByRole('figure', { name: 'Pace at 148 bpm over the years' })
    expect(within(figure).getByRole('img').getAttribute('aria-label')).toMatch(
      /^GAP at 148 bpm as plateaus from January 2020 to August 2024, each with its 90% range, and the slips and rises between them\.$/,
    )
  })

  it('draws the plateaus as a step line with a band, and each episode as a span with its word', () => {
    const { container } = render(
      <YearsChart sport="run" years={RUN_YEARS} referenceHr={148} units="metric" />,
    )
    expect(container.querySelector('[data-testid="years-line"]')?.getAttribute('d')).not.toBe('')
    expect(container.querySelector('[data-testid="years-band"]')?.getAttribute('d')).not.toBe('')
    const spans = [...container.querySelectorAll('[data-testid="years-span"]')]
    expect(spans).toHaveLength(2)
    expect(spans.map((s) => s.querySelector('rect')?.getAttribute('class'))).toEqual([
      expect.stringContaining('years-chart__span--slip-back'),
      expect.stringContaining('years-chart__span--slip-open'),
    ])
  })

  it("has a table twin with a row for each plateau, in the reader's units", () => {
    const { container } = render(
      <YearsChart sport="run" years={RUN_YEARS} referenceHr={148} units="metric" />,
    )
    const rows = [...container.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent),
    )
    expect(rows).toHaveLength(4)
    expect(rows[0]![0]).toBe('January 2020 to May 2021')
    expect(rows[0]![1]).toMatch(/\/km$/)
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(headers).toContain('Steady runs')
  })

  it('says it cannot draw one plateau', () => {
    const one = { ...RUN_YEARS, levels: RUN_YEARS.levels.slice(0, 1) }
    render(<YearsChart sport="run" years={one} referenceHr={148} units="metric" />)
    expect(screen.getByText('Not enough plateaus to draw')).toBeInTheDocument()
  })
})

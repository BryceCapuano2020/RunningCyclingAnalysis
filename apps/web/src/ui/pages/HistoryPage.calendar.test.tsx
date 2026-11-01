// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { NO_HISTORY } from '@rca/core/history'
import { afterEach, describe, expect, it } from 'vitest'
import { GRADING } from '../balanceFixtures'
import { libraryOf } from '../calendarFixtures'
import { HistoryPage } from './HistoryPage'

afterEach(cleanup)

const cellsOfRow = (table: HTMLElement, year: string) => {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('rowheader', { name: year }) !== null)
  return within(row!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

describe('HistoryPage with the training calendar', () => {
  // A week that spans New Year, with a run on each side of it, then a quiet week and a run in March 2026.
  const history = {
    ...NO_HISTORY,
    ...libraryOf([
      { on: [2025, 12, 31], run: [1, 1] },
      { on: [2026, 1, 2], run: [1.5, 1] },
      { on: [2026, 3, 10], run: [2, 1] },
    ]),
  }

  it('draws the calendar before the hours per year, and names the streak and the biggest week', () => {
    render(<HistoryPage history={history} units="metric" grading={GRADING} />)
    const figures = screen.getAllByRole('figure')
    const hours = screen.getByRole('figure', { name: 'Run hours per year' })
    const calendar = screen.getByRole('figure', { name: 'Run training calendar' })
    expect(calendar).toHaveTextContent('Your longest running streak was 1 week')
    expect(figures.indexOf(calendar)).toBeLessThan(figures.indexOf(hours))
  })

  it('gives each year the same hours in the calendar as in Hours per year', () => {
    render(<HistoryPage history={history} units="metric" grading={GRADING} />)
    const hours = screen.getByRole('table', { name: 'Hours per year, by sport' })
    const training = screen.getByRole('table', { name: 'Training by year' })
    for (const [year, run] of [
      ['2025', '1.0'],
      ['2026', '3.5'],
    ] as const) {
      // Run (h) is the first value of a year in the hours table, and Hours the first in the calendar's.
      expect(cellsOfRow(hours, year)[0]).toBe(run)
      expect(cellsOfRow(training, year)[0]).toBe(run)
    }
  })
})

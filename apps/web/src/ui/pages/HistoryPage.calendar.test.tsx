// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { calendarOf } from '../calendarFixtures'
import { historyOfYears, THREE_YEARS } from '../historyFixtures'
import { HistoryPage } from './HistoryPage'

afterEach(cleanup)

describe('HistoryPage with the training calendar', () => {
  it('draws the calendar after the hours per year, from the history’s own weeks', () => {
    const history = {
      ...historyOfYears(THREE_YEARS),
      calendar: calendarOf([
        { on: [2021, 3, 2], run: [3, 2] },
        { on: [2021, 3, 16], run: [2, 1], ride: [1, 1] },
      ]),
    }
    render(<HistoryPage history={history} units="metric" />)
    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(2)
    expect(screen.getByRole('figure', { name: 'Hours per year' })).toBeInTheDocument()
    const calendar = screen.getByRole('figure', { name: 'Training calendar' })
    expect(calendar).toHaveTextContent('Your longest streak was 1 week')
    expect(figures.indexOf(calendar)).toBe(1)
  })
})

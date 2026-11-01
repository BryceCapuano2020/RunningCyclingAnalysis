// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../test/deviceZone'
import { GRADING, balanceRows, TWELVE_YEARS } from '../balanceFixtures'
import { historyOfYears, THREE_YEARS, yearRow } from '../historyFixtures'
import { HistoryPage } from './HistoryPage'

afterEach(cleanup)

describe('HistoryPage', () => {
  it('has the heading, the summary row and the hours chart, with distances in the units setting', () => {
    const history = historyOfYears(THREE_YEARS)
    const { rerender } = render(<HistoryPage history={history} units="metric" grading={GRADING} />)
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    for (const label of ['Years on file', 'Total hours', 'Run distance', 'Ride distance']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('figure', { name: 'Hours per year' })).toBeInTheDocument()
    expect(screen.getByText('1,850.0 km')).toBeInTheDocument()
    rerender(<HistoryPage history={history} units="imperial" grading={GRADING} />)
    expect(screen.getByText('1,149.5 mi')).toBeInTheDocument()
  })

  it('opens with the balance over the years, before the hours, and says what grading needs when it cannot draw', () => {
    const history = { ...historyOfYears(THREE_YEARS), balance: balanceRows(TWELVE_YEARS) }
    const { rerender } = render(<HistoryPage history={history} units="metric" grading={GRADING} />)
    const figures = screen.getAllByRole('figure')
    const balance = screen.getByRole('figure', { name: 'Running led every year until 2019' })
    const hours = screen.getByRole('figure', { name: 'Hours per year' })
    expect(figures.indexOf(balance)).toBeLessThan(figures.indexOf(hours))
    const missing = { profile: null, missingAge: 'sex' as const, weightKnown: true }
    rerender(<HistoryPage history={history} units="metric" grading={missing} />)
    expect(screen.getByText('Age grade by year needs your sex.')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Hours per year' })).toBeInTheDocument()
  })

  it('works for one year of one sport', () => {
    const one = historyOfYears([yearRow(2024, { hours: 12, distanceM: 90_000, activities: 8 })])
    render(<HistoryPage history={one} units="metric" grading={GRADING} />)
    expect(screen.getByText('Year on file')).toBeInTheDocument()
    expect(screen.queryByText('Ride distance')).toBeNull()
    expect(screen.getByRole('figure', { name: 'Run hours per year' })).toBeInTheDocument()
  })

  it('says what to add when the library holds no runs or rides, and draws no chart', () => {
    render(<HistoryPage history={historyOfYears([])} units="metric" grading={GRADING} />)
    expect(screen.getByText('Add runs or rides to see your history.')).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.queryByText('Total hours')).toBeNull()
  })
})

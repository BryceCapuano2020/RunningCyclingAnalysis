// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../test/deviceZone'
import { historyOfYears, THREE_YEARS, yearRow } from '../historyFixtures'
import { HistoryPage } from './HistoryPage'

afterEach(cleanup)

describe('HistoryPage', () => {
  it('has the heading, the summary row and the hours chart, with distances in the units setting', () => {
    const history = historyOfYears(THREE_YEARS)
    const { rerender } = render(<HistoryPage history={history} units="metric" />)
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    for (const label of ['Years on file', 'Total hours', 'Run distance', 'Ride distance']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('figure', { name: 'Hours per year' })).toBeInTheDocument()
    expect(screen.getByText('1,850.0 km')).toBeInTheDocument()
    rerender(<HistoryPage history={history} units="imperial" />)
    expect(screen.getByText('1,149.5 mi')).toBeInTheDocument()
  })

  it('works for one year of one sport', () => {
    const one = historyOfYears([yearRow(2024, { hours: 12, distanceM: 90_000, activities: 8 })])
    render(<HistoryPage history={one} units="metric" />)
    expect(screen.getByText('Year on file')).toBeInTheDocument()
    expect(screen.queryByText('Ride distance')).toBeNull()
    expect(screen.getByRole('figure', { name: 'Run hours per year' })).toBeInTheDocument()
  })

  it('says what to add when the library holds no runs or rides, and draws no chart', () => {
    render(<HistoryPage history={historyOfYears([])} units="metric" />)
    expect(screen.getByText('Add runs or rides to see your history.')).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.queryByText('Total hours')).toBeNull()
  })
})

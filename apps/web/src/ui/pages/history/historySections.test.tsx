// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../test/deviceZone'
import { chartWidth } from '../../charts/chartSizeStub'
import { BESTS, RIDE_BESTS, historyWithBests } from '../../historyBestsFixtures'
import { GRADING } from '../../balanceFixtures'
import { THREE_YEARS } from '../../historyFixtures'
import { HistoryPage } from '../HistoryPage'
import { BestsByYearSection } from './BestsByYearSection'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('bests by year', () => {
  it('has a Run and Ride toggle, starts on the run, and switches the chart to the ride', () => {
    chartWidth(800)
    render(<BestsByYearSection bests={BESTS} units="metric" />)
    expect(screen.getByRole('radio', { name: 'Run' })).toBeChecked()
    expect(screen.getByRole('figure', { name: 'Run bests by year' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked()
    expect(screen.getByRole('figure', { name: 'Ride bests by year' })).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Run bests by year' })).toBeNull()
  })

  it('clears a reading when the sport changes, since the other sport has other years', () => {
    chartWidth(800)
    render(<BestsByYearSection bests={BESTS} units="metric" />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'End' })
    expect(screen.getByRole('status')).toHaveTextContent('2024')
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('has no toggle for a library with one sport’s bests, and shows that sport', () => {
    chartWidth(800)
    render(<BestsByYearSection bests={{ run: [], ride: RIDE_BESTS }} units="metric" />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('figure', { name: 'Ride bests by year' })).toBeInTheDocument()
  })

  it('says what to add when neither sport has a best', () => {
    chartWidth(800)
    render(<BestsByYearSection bests={{ run: [], ride: [] }} units="metric" />)
    expect(
      screen.getByText('Add outdoor runs or rides to see your bests by year.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
  })
})

describe('the History page', () => {
  it('has the hours, then bests by year, from the whole library’s history', () => {
    chartWidth(800)
    render(
      <HistoryPage
        history={{ ...historyWithBests(), years: THREE_YEARS }}
        units="metric"
        grading={GRADING}
        lookBack={NO_LOOKBACK}
      />,
    )
    const names = screen
      .getAllByRole('figure')
      .map((figure) => figure.getAttribute('aria-labelledby'))
    const titles = names.map((id) => document.getElementById(id!)!.textContent)
    const mine = ['Hours per year', 'Run bests by year']
    expect(titles.filter((title) => mine.includes(title ?? ''))).toEqual(mine)
  })

  it('calls the library’s latest year "so far" when it is the year the clock is in, and no year otherwise', () => {
    chartWidth(800)
    const base = { ...historyWithBests(), years: THREE_YEARS }
    const going = { ...base, yearToDate: { ...base.yearToDate, today: { year: 2023, day: 120 } } }
    const { rerender } = render(
      <HistoryPage history={going} units="metric" grading={GRADING} lookBack={NO_LOOKBACK} />,
    )
    expect(screen.getAllByText('2023 so far').length).toBeGreaterThan(0)
    const past = { ...base, yearToDate: { ...base.yearToDate, today: { year: 2024, day: 5 } } }
    rerender(<HistoryPage history={past} units="metric" grading={GRADING} lookBack={NO_LOOKBACK} />)
    expect(screen.queryByText(/so far/)).toBeNull()
  })
})

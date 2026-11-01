// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../test/deviceZone'
import { chartWidth } from '../../charts/chartSizeStub'
import {
  BESTS,
  CURVES,
  RIDE_BESTS,
  RIDE_CURVES,
  RUN_CURVES,
  historyWithBests,
} from '../../historyBestsFixtures'
import { GRADING } from '../../balanceFixtures'
import { THREE_YEARS } from '../../historyFixtures'
import { HistoryPage } from '../HistoryPage'
import { BestCurveByYearSection } from './BestCurveByYearSection'
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

describe('best curve by year', () => {
  it('has a Run and Ride toggle with a finding for each', () => {
    chartWidth(800)
    render(<BestCurveByYearSection curves={CURVES} units="metric" />)
    expect(
      screen.getByRole('figure', { name: 'Your 20 min pace peaked in 2021' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(
      screen.getByRole('figure', { name: 'Your 20 min power is highest in 2023' }),
    ).toBeInTheDocument()
  })

  it('offers only a sport with two years to compare', () => {
    chartWidth(800)
    const oneYear = { ...RIDE_CURVES, years: RIDE_CURVES.years.slice(0, 1) }
    render(<BestCurveByYearSection curves={{ run: RUN_CURVES, ride: oneYear }} units="metric" />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('figure', { name: /Your 20 min pace/ })).toBeInTheDocument()
  })

  it('says what to add when no sport has two years', () => {
    chartWidth(800)
    const none = { ...RUN_CURVES, years: [] }
    render(<BestCurveByYearSection curves={{ run: none, ride: none }} units="metric" />)
    expect(
      screen.getByText('Add runs or rides from more than one year to compare years.'),
    ).toBeInTheDocument()
  })
})

describe('the History page', () => {
  it('has both charts after the hours, bests by year first, from the whole library’s history', () => {
    chartWidth(800)
    render(
      <HistoryPage
        history={{ ...historyWithBests(), years: THREE_YEARS }}
        units="metric"
        grading={GRADING}
      />,
    )
    const names = screen
      .getAllByRole('figure')
      .map((figure) => figure.getAttribute('aria-labelledby'))
    const titles = names.map((id) => document.getElementById(id!)!.textContent)
    // The sections with nothing in this history say so, and sit where they sit; the three it has run in this order.
    const mine = ['Hours per year', 'Run bests by year', 'Your 20 min pace peaked in 2021']
    expect(titles.filter((title) => mine.includes(title ?? ''))).toEqual(mine)
  })
})

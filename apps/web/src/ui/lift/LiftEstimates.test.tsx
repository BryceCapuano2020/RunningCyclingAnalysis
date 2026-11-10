// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { chartWidth } from '../charts/test/chartSizeStub'
import { risingSquats, squat } from './liftFixtures'
import { liftOverviewOf } from './liftEntries'
import { LiftEstimates } from './LiftEstimates'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const overviewOf = (sets = risingSquats()) =>
  liftOverviewOf(sets, SETTINGS, null, 'metric', '2031-03-02')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LiftEstimates', () => {
  it('draws each lift’s estimate with its range, and its Details hold the rows and the rep bests', () => {
    chartWidth(800)
    const { container } = render(<LiftEstimates overview={overviewOf()} units="metric" />)
    const entry = container.querySelector('.lift__estimate') as HTMLElement
    expect(within(entry).getByRole('heading', { name: 'Back squat, barbell' })).toBeInTheDocument()
    expect(entry.querySelectorAll('[data-testid="lift-point"]')).toHaveLength(16)
    expect(entry.querySelector('[data-testid="lift-band"]')).not.toBeNull()
    const details = entry.querySelector('details.disclosure') as HTMLElement
    expect(details.querySelector('summary')).toHaveTextContent('Details')
    expect(details).toHaveTextContent('One-rep max')
    expect(details).toHaveTextContent('Floor')
    expect(within(details).getByRole('heading', { name: 'Rep bests' })).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: /^Method/ })).toBeInTheDocument()
  })

  it('reads a session with the keyboard: the estimate, its range and its floor', () => {
    chartWidth(800)
    render(<LiftEstimates overview={overviewOf()} units="metric" />)
    const surfaces = screen.getAllByTestId('plot-surface')
    fireEvent.keyDown(surfaces[0]!, { key: 'Home' })
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/80% range .* to .* kg; floor/)
  })

  it('lists a lift with one session in Other lifts, with no chart and no placeholder', () => {
    chartWidth(800)
    const { container } = render(
      <LiftEstimates overview={overviewOf([squat('2031-03-02', 100)])} units="metric" />,
    )
    expect(screen.getByRole('heading', { name: 'Other lifts' })).toBeInTheDocument()
    expect(screen.getByText('Back squat, barbell')).toBeInTheDocument()
    expect(container.querySelector('.lift__estimate')).toBeNull()
    expect(screen.queryByText(/A line needs two sessions/)).toBeNull()
  })

  it('draws the weekly load as a bar a week, with the hard sets and regional volume in the table', () => {
    chartWidth(800)
    const { container } = render(<LiftEstimates overview={overviewOf()} units="metric" />)
    expect(screen.getByRole('heading', { name: 'Weekly load' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="load-bar"]').length).toBeGreaterThan(5)
    const surfaces = screen.getAllByTestId('plot-surface')
    fireEvent.keyDown(surfaces.at(-1)!, { key: 'End' })
    expect(screen.getAllByRole('status').at(-1)).toHaveTextContent(/\d+ Working sets.*hard set/)
    expect(container).toHaveTextContent('Hard sets are RPE 7 or more.')
  })

  it('draws nothing with no lifts', () => {
    chartWidth(800)
    const { container } = render(<LiftEstimates overview={overviewOf([])} units="imperial" />)
    expect(container).toBeEmptyDOMElement()
  })
})

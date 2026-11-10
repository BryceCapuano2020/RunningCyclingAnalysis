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

  it('says a lift with one session has no line yet, with no empty chart', () => {
    chartWidth(800)
    const { container } = render(
      <LiftEstimates overview={overviewOf([squat('2031-03-02', 100)])} units="metric" />,
    )
    const entry = container.querySelector('.lift__estimate') as HTMLElement
    expect(entry).toHaveTextContent('One session so far')
    expect(entry.querySelector('[data-testid="lift-point"]')).toBeNull()
    expect(screen.queryByText(/A line needs two sessions/)).toBeNull()
  })

  it('shows the lead lift first, and another chosen from the select or from its row in the table', () => {
    chartWidth(800)
    const curls = [
      squat('2031-02-01', 20, { exercise: 'curl', equipment: 'cable' }),
      squat('2031-02-08', 21, { exercise: 'curl', equipment: 'cable' }),
    ]
    const { container } = render(
      <LiftEstimates overview={overviewOf([...curls, squat('2031-03-02', 100)])} units="metric" />,
    )
    const shown = () => container.querySelector('.lift__estimate')?.getAttribute('data-lift')
    const select = screen.getByLabelText('Lift shown') as HTMLSelectElement
    // The squat leads (a big-three lift), even though only the curl has a line.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Back squat, barbell')
    expect([...select.options].map((option) => option.text)).toEqual([
      'Back squat, barbell',
      'Curl, cable',
    ])
    fireEvent.change(select, { target: { value: select.options[1]!.value } })
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Curl, cable')
    expect(container.querySelectorAll('[data-testid="lift-point"]')).toHaveLength(2)
    const table = screen.getByRole('table', { name: 'Every lift with its one-rep max' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Lift', 'One-rep max', 'Heaviest set', 'Last session'])
    fireEvent.click(within(table).getByRole('button', { name: 'Back squat, barbell' }))
    expect(shown()).toBe(select.options[0]!.value)
    expect(within(table).getByRole('button', { name: 'Back squat, barbell' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.activeElement).toBe(select)
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

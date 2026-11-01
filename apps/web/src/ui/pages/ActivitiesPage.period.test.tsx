// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '@rca/core/period'
import { makeActivity } from '../components/fixtures'
import { ActivitiesPage } from './ActivitiesPage'

beforeEach(() => {
  window.history.replaceState(null, '', '#/activities')
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
})

const LIBRARY = [
  makeActivity({ id: 'run-1', name: 'Run 1', sport: 'run' }),
  makeActivity({ id: 'ride-1', name: 'Ride 1', sport: 'ride' }),
]

const WINDOW = { startMs: 0, endMs: 1, fellBack: false }
const TWELVE_WEEKS: Period = { ...WINDOW, choice: 'default', days: 84 }
const ALL_TIME: Period = { ...WINDOW, choice: 'all', days: null }
const CUSTOM: Period = {
  ...WINDOW,
  choice: { from: '2026-01-01', to: '2026-02-01' },
  days: 32,
}

function renderPage(analysisPeriod?: Period) {
  render(
    <ActivitiesPage
      signedIn={false}
      activities={LIBRARY}
      units="metric"
      records={new Map()}
      analysisPeriod={analysisPeriod}
    />,
  )
}

const NOTE = /This list has its own period\./

describe('ActivitiesPage beside the period on Balance', () => {
  it('says the list is apart from the 12 weeks the other pages show, which it starts without', () => {
    renderPage(TWELVE_WEEKS)
    expect(
      screen.getByText(
        'Balance, Run and Ride show the last 12 weeks. This list has its own period.',
      ),
    ).toBeInTheDocument()
    // The list itself starts on the whole library: nothing in it follows the 12 weeks.
    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked()
  })

  it('names a custom range as one, and a length picked from the control by its words', () => {
    renderPage(CUSTOM)
    expect(screen.getByText(/^Balance, Run and Ride show your custom range\./)).toBeInTheDocument()
    cleanup()
    renderPage({ ...WINDOW, choice: 365, days: 365 })
    expect(screen.getByText(/^Balance, Run and Ride show the last 12 months\./)).toBeInTheDocument()
  })

  it('says nothing when the other pages and the list both show all time, or when it is not told their period', () => {
    renderPage(ALL_TIME)
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    cleanup()
    renderPage()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('says the other pages show all time when the list is narrowed to a shorter period', async () => {
    renderPage(ALL_TIME)
    await userEvent.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(
      screen.getByText('Balance, Run and Ride show all time. This list has its own period.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('keeps the line for a custom range that is as many days as the list’s length', async () => {
    // A 365-day custom range would equal 12 months by days, but it is dated, not named.
    renderPage({ ...WINDOW, choice: { from: '2025-01-01', to: '2025-12-31' }, days: 365 })
    await userEvent.click(screen.getByRole('radio', { name: '12 months' }))
    expect(screen.getByText(/show your custom range/)).toBeInTheDocument()
  })

  it('goes for a default that resolved to the list’s length, and names the length it resolved to', async () => {
    renderPage({ ...WINDOW, choice: 'default', days: 365 })
    expect(screen.getByText(/^Balance, Run and Ride show the last 12 months\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '12 months' }))
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    cleanup()
    // No segment is 26 weeks, so the list is always apart from it.
    renderPage({ ...WINDOW, choice: 'default', days: 182 })
    expect(screen.getByText(/^Balance, Run and Ride show the last 26 weeks\./)).toBeInTheDocument()
  })

  it('goes once the list is set to the same length, since the two then agree', async () => {
    renderPage({ ...WINDOW, choice: 365, days: 365 })
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '12 months' }))
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })
})

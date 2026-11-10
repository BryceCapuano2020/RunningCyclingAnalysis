// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeActivity } from '../components/test/fixtures'
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

function renderPage() {
  return render(
    <ActivitiesPage signedIn={false} activities={LIBRARY} units="metric" records={new Map()} />,
  )
}

/** The line the page once carried when Balance was on another period than the list. */
const OLD_LINE = /show .*This list has its own period|Balance, Run and Ride show/

describe('ActivitiesPage period', () => {
  it('starts on the whole library, with its own period control and no line about another period', () => {
    const { container } = renderPage()

    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked()
    expect(screen.getByText('Run 1')).toBeInTheDocument()
    expect(screen.getByText('Ride 1')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(OLD_LINE)
    expect(container.textContent).not.toMatch(/own period/)
  })

  it('keeps its own period when it is narrowed, and still says nothing about the other pages', async () => {
    const { container } = renderPage()

    await userEvent.click(screen.getByRole('radio', { name: '6 weeks' }))

    expect(screen.getByRole('radio', { name: '6 weeks' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All time' })).not.toBeChecked()
    expect(container.textContent).not.toMatch(OLD_LINE)
    expect(container.textContent).not.toMatch(/own period/)
  })
})

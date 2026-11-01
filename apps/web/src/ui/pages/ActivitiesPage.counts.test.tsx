// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import type { ActivitySummary } from '@rca/core/pipeline'
import { DAY_MS } from '@rca/core/constants'
import { makeActivity } from '../components/fixtures'
import { ActivitiesPage } from './ActivitiesPage'

beforeEach(() => {
  window.history.replaceState(null, '', '#/activities')
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
})

/** Eight on file: five runs and three rides. A walking-pace run, a run labelled Hike and a ride labelled Ski are left out. */
const NEWEST_MS = Date.UTC(2026, 0, 20, 7)
let daysBack = 0
/** An activity a day older than the one made before it, so the list's order is the order they are written in. */
function dated(overrides: Partial<ActivitySummary>): ActivitySummary {
  daysBack += 1
  return makeActivity({ startMs: NEWEST_MS - daysBack * DAY_MS, ...overrides })
}
const LIBRARY: ActivitySummary[] = [
  dated({ id: 'run-1', name: 'Easy loop', sport: 'run' }),
  dated({ id: 'run-2', name: 'Tempo loop', sport: 'run' }),
  dated({ id: 'run-3', name: 'Trail hike', sport: 'run', walkingPace: true }),
  dated({ id: 'run-4', name: 'Hill walk', sport: 'run', athleteType: 'hike' }),
  dated({ id: 'run-5', name: 'Long loop', sport: 'run' }),
  dated({ id: 'ride-1', name: 'Short spin', sport: 'ride' }),
  dated({ id: 'ride-2', name: 'Snow day', sport: 'ride', athleteType: 'ski' }),
  dated({ id: 'ride-3', name: 'Hill ride', sport: 'ride' }),
]

function renderList(activities: ActivitySummary[] = LIBRARY) {
  return render(
    <ActivitiesPage signedIn={false} activities={activities} units="metric" records={new Map()} />,
  )
}

/** The names of the activities listed, in order: the links that open an activity. */
function openedActivities(): string[] {
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href')?.startsWith('#/activities/'))
    .map((link) => link.textContent ?? '')
}

describe('the Activities count', () => {
  it('gives the activities on file, and how many of them the analysis does not count', () => {
    const { container } = renderList()
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '8 activities, 3 not counted',
    )
  })

  it('says nothing about a count when every activity is counted', () => {
    const { container } = renderList(
      LIBRARY.filter((activity) => activity.athleteType === undefined && !activity.walkingPace),
    )
    expect(container.querySelector('.range-picker__count')).toBeNull()
    expect(screen.queryByText(/not counted/)).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Show' })).not.toBeInTheDocument()
  })

  it('counts one sport on the same rule', async () => {
    const user = userEvent.setup()
    const { container } = renderList()
    await user.click(screen.getByRole('radio', { name: 'Runs' }))
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '5 runs, 2 not counted',
    )
  })

  it('announces the count it shows, in a status that is hidden from sight', () => {
    renderList()
    const status = screen.getAllByRole('status').find((node) => node.classList.contains('sr-only'))
    expect(status).toHaveTextContent('Showing all 8 activities, 3 not counted, All time')
  })
})

describe('the filter for activities not counted', () => {
  it('lists only the activities left out, each marked with its reason', async () => {
    const user = userEvent.setup()
    renderList()
    const group = screen.getByRole('group', { name: 'Show' })
    await user.click(within(group).getByRole('radio', { name: 'Not counted' }))
    expect(openedActivities()).toEqual(['Trail hike', 'Hill walk', 'Snow day'])
    expect(screen.getByRole('link', { name: 'Trail hike' })).toBeInTheDocument()
    expect(screen.getByText('Walking pace')).toBeInTheDocument()
    expect(screen.getByText('Hike')).toBeInTheDocument()
    expect(screen.getByText('Ski')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Easy loop' })).not.toBeInTheDocument()
  })

  it('narrows to a sport as well, and keeps the address in step', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole('radio', { name: 'Not counted' }))
    await user.click(screen.getByRole('radio', { name: 'Rides' }))
    expect(screen.getByRole('link', { name: 'Snow day' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trail hike' })).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/activities?sport=ride&show=not-counted')
  })

  it('opens already on the activities left out when the address names them', () => {
    window.history.replaceState(null, '', '#/activities?show=not-counted')
    renderList()
    expect(screen.getByRole('radio', { name: 'Not counted' })).toBeChecked()
    expect(screen.queryByRole('link', { name: 'Easy loop' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hill walk' })).toBeInTheDocument()
  })

  it('goes back to every activity with one press', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '#/activities?show=not-counted')
    renderList()
    const group = screen.getByRole('group', { name: 'Show' })
    await user.click(within(group).getByRole('radio', { name: 'All' }))
    expect(screen.getByRole('link', { name: 'Easy loop' })).toBeInTheDocument()
  })

  it('says every activity is counted when the sport has none left out, and offers the whole list back', async () => {
    window.history.replaceState(null, '', '#/activities?sport=ride&show=not-counted')
    renderList([
      makeActivity({ id: 'run-1', name: 'Trail hike', sport: 'run', walkingPace: true }),
      makeActivity({ id: 'ride-1', name: 'Short spin', sport: 'ride' }),
    ])
    expect(screen.getByText('Every ride here is counted.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all activities' })).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { DAY_MS } from '@rca/core/constants'
import { makeActivity } from '../components/fixtures'
import { ActivitiesPage } from './ActivitiesPage'

afterEach(() => {
  cleanup()
})

function activities(runs: number, rides: number): ActivitySummary[] {
  const runList = Array.from({ length: runs }, (_, i) =>
    makeActivity({ id: `run-${i}`, name: `Run ${i}`, sport: 'run' }),
  )
  const rideList = Array.from({ length: rides }, (_, i) =>
    makeActivity({ id: `ride-${i}`, name: `Ride ${i}`, sport: 'ride' }),
  )
  return [...runList, ...rideList]
}

describe('ActivitiesPage', () => {
  it('has a focusable page heading named Activities', () => {
    render(<ActivitiesPage activities={[]} units="metric" records={new Map()} />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Activities' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('counts the activities by sport in one line', () => {
    render(<ActivitiesPage activities={activities(8, 6)} units="metric" records={new Map()} />)
    expect(screen.getByText('14 activities: 8 runs, 6 rides')).toBeInTheDocument()
  })

  it('uses the singular for one activity of a sport', () => {
    render(<ActivitiesPage activities={activities(1, 0)} units="metric" records={new Map()} />)
    expect(screen.getByText('1 activity: 1 run, 0 rides')).toBeInTheDocument()
  })

  it('lists the activities, each linking to its page', () => {
    render(<ActivitiesPage activities={activities(1, 1)} units="metric" records={new Map()} />)
    expect(screen.getByRole('link', { name: 'Run 0' })).toHaveAttribute(
      'href',
      '#/activities/run-0',
    )
    expect(screen.getByRole('link', { name: 'Ride 0' })).toHaveAttribute(
      'href',
      '#/activities/ride-0',
    )
  })

  it('says there are no activities yet, and shows no list, when the period is empty', () => {
    render(<ActivitiesPage activities={[]} units="metric" records={new Map()} />)
    expect(screen.getByText('No activities yet')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/activities:/)).not.toBeInTheDocument()
  })
})

describe('ActivitiesPage period and sport', () => {
  const NEWEST = Date.UTC(2026, 5, 1, 7)
  // A recent run and ride, and an older run that six weeks does not reach.
  const library = [
    makeActivity({ id: 'run-new', name: 'Recent run', sport: 'run', startMs: NEWEST }),
    makeActivity({
      id: 'ride-new',
      name: 'Recent ride',
      sport: 'ride',
      startMs: NEWEST - 3 * DAY_MS,
    }),
    makeActivity({
      id: 'run-old',
      name: 'Old run',
      sport: 'run',
      startMs: NEWEST - 100 * DAY_MS,
    }),
  ]

  it('shows the whole library, with no count, until a period or sport is picked', () => {
    render(<ActivitiesPage activities={library} units="metric" records={new Map()} />)
    expect(screen.getByRole('link', { name: 'Old run' })).toBeInTheDocument()
    expect(screen.queryByText(/of 3 activities/)).not.toBeInTheDocument()
  })

  it('narrows to a period and counts how many of the library it holds', async () => {
    const user = userEvent.setup()
    render(<ActivitiesPage activities={library} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(screen.queryByRole('link', { name: 'Old run' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Recent run' })).toBeInTheDocument()
    expect(screen.getByText('2 of 3 activities')).toBeInTheDocument()
  })

  it('filters to one sport and counts it against the library', async () => {
    const user = userEvent.setup()
    render(<ActivitiesPage activities={library} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: 'Rides' }))
    expect(screen.getByRole('link', { name: 'Recent ride' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Recent run' })).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3 activities')).toBeInTheDocument()
  })

  it('offers to show every activity again when the filters leave none', async () => {
    const user = userEvent.setup()
    const rides = library.filter((activity) => activity.sport === 'ride')
    render(<ActivitiesPage activities={rides} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: 'Runs' }))
    expect(screen.getByText('No runs in your files.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all activities' }))
    expect(screen.getByRole('link', { name: 'Recent ride' })).toBeInTheDocument()
  })

  it('stays on the page it is on when the parent re-renders with the same activities', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run ${i}`, sport: 'run', startMs: NEWEST - i * DAY_MS }),
    )
    const view = render(<ActivitiesPage activities={many} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('link', { name: 'Run 20' })).toBeInTheDocument()

    view.rerender(<ActivitiesPage activities={many} units="metric" records={new Map()} />)

    expect(screen.getByRole('link', { name: 'Run 20' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Run 0' })).not.toBeInTheDocument()
  })

  it('names the dates a period leaves no runs in, and offers all activities', async () => {
    const user = userEvent.setup()
    const newest = new Date(2026, 5, 1, 7).getTime()
    const recentRide = makeActivity({
      id: 'ride-new',
      name: 'Recent ride',
      sport: 'ride',
      startMs: newest,
    })
    const oldRun = makeActivity({
      id: 'run-old',
      name: 'Old run',
      sport: 'run',
      startMs: newest - 100 * DAY_MS,
    })
    render(<ActivitiesPage activities={[recentRide, oldRun]} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    await user.click(screen.getByRole('radio', { name: 'Runs' }))
    expect(screen.getByText('No runs between 21 Apr and 1 Jun 2026.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all activities' }))
    expect(screen.getByRole('link', { name: 'Old run' })).toBeInTheDocument()
  })
})

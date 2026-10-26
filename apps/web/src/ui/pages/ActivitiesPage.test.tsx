// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { DAY_MS } from '@rca/core/constants'
import { makeActivity } from '../components/fixtures'
import { ActivitiesPage } from './ActivitiesPage'

// The view is kept in the address, so each test starts from the bare list. jsdom has no layout, so a
// page turn's scroll to the top of the list is a stub.
beforeEach(() => {
  window.history.replaceState(null, '', '#/activities')
  Element.prototype.scrollIntoView = vi.fn()
})

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

  it('filters to one sport, and shows no count while every ride is in the list', async () => {
    const user = userEvent.setup()
    render(<ActivitiesPage activities={library} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: 'Rides' }))
    expect(screen.getByRole('link', { name: 'Recent ride' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Recent run' })).not.toBeInTheDocument()
    expect(screen.queryByText(/of 3 activities/)).not.toBeInTheDocument()
  })

  it("counts a period's rides against all the rides, in the noun for a ride", async () => {
    const user = userEvent.setup()
    const rides = [
      makeActivity({ id: 'ride-new', name: 'Recent ride', sport: 'ride', startMs: NEWEST }),
      makeActivity({
        id: 'ride-old',
        name: 'Old ride',
        sport: 'ride',
        startMs: NEWEST - 100 * DAY_MS,
      }),
      makeActivity({ id: 'run-new', name: 'Recent run', sport: 'run', startMs: NEWEST }),
    ]
    render(<ActivitiesPage activities={rides} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    await user.click(screen.getByRole('radio', { name: 'Rides' }))
    expect(screen.getByText('1 of 2 rides')).toBeInTheDocument()
    expect(screen.queryByText(/of 3 activities/)).not.toBeInTheDocument()
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

describe('ActivitiesPage sort, months and address', () => {
  const NEWEST = new Date(2026, 5, 1, 7).getTime()
  const trips = [
    makeActivity({ id: 'long', name: 'Long run', startMs: NEWEST - 40 * DAY_MS, distanceM: 30000 }),
    makeActivity({ id: 'new', name: 'New run', startMs: NEWEST, distanceM: 5000 }),
    makeActivity({
      id: 'ride',
      name: 'Hill ride',
      sport: 'ride',
      startMs: NEWEST - 2 * DAY_MS,
      distanceM: 60000,
      elevationGainM: 900,
    }),
  ]

  it('sorts from the sort menu, and the list it shows is the sort the menu names', async () => {
    const user = userEvent.setup()
    render(<ActivitiesPage activities={trips} units="metric" records={new Map()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'distance')
    const names = screen.getAllByRole('link').map((link) => link.textContent)
    expect(names.slice(0, 3)).toEqual(['Hill ride', 'Long run', 'New run'])
  })

  it('heads months only when the list is in date order', async () => {
    const user = userEvent.setup()
    render(<ActivitiesPage activities={trips} units="metric" records={new Map()} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Jun 2026',
      'May 2026',
      'Apr 2026',
    ])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'climb')
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('keeps the sport, sort and page in the address, so the list opened again is the same one', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `r-${i}`, name: `Run ${i}`, startMs: NEWEST - i * DAY_MS }),
    )
    const view = render(<ActivitiesPage activities={many} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(window.location.hash).toBe('#/activities?page=2')
    view.unmount()

    render(<ActivitiesPage activities={many} units="metric" records={new Map()} />)
    expect(screen.getByText('Showing 21–25 of 25 activities. Page 2 of 2.')).toBeVisible()
  })

  it('keeps a sport and sort in the address, and restores them on the next visit', async () => {
    const user = userEvent.setup()
    const view = render(<ActivitiesPage activities={trips} units="metric" records={new Map()} />)
    await user.click(screen.getByRole('radio', { name: 'Rides' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'time')
    expect(window.location.hash).toBe('#/activities?sport=ride&sort=time')
    view.unmount()

    render(<ActivitiesPage activities={trips} units="metric" records={new Map()} />)
    expect(screen.getByRole('radio', { name: 'Rides' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('time')
    expect(screen.queryByRole('link', { name: 'New run' })).not.toBeInTheDocument()
  })

  it('writes the address without a history entry, so Back still leaves the page', async () => {
    const user = userEvent.setup()
    render(<ActivitiesPage activities={trips} units="metric" records={new Map()} />)
    const before = window.history.length
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'distance')
    expect(window.history.length).toBe(before)
  })

  it('offers Delete on a kept activity, and removes it by its saved copy', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <ActivitiesPage
        activities={trips}
        units="metric"
        records={new Map()}
        keptIds={new Map([['new', 'saved-new']])}
        onDelete={onDelete}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete New run' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('saved-new')
  })
})

describe('ActivitiesPage delete outcome and the address', () => {
  const trip = makeActivity({
    id: 'new',
    name: 'New run',
    startMs: new Date(2026, 5, 1, 7).getTime(),
  })

  it('says where a delete worked, beside the list', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const view = render(
      <ActivitiesPage
        activities={[trip]}
        units="metric"
        records={new Map()}
        keptIds={new Map([['new', 'saved-new']])}
        onDelete={onDelete}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete New run' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    view.rerender(
      <ActivitiesPage
        activities={[]}
        units="metric"
        records={new Map()}
        keptIds={new Map()}
        onDelete={onDelete}
        libraryNotice="Deleted New run."
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Deleted New run.')
  })

  it('says where a delete failed, beside the list, and keeps the activity listed', async () => {
    const user = userEvent.setup()
    const view = render(
      <ActivitiesPage
        activities={[trip]}
        units="metric"
        records={new Map()}
        keptIds={new Map([['new', 'saved-new']])}
        onDelete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete New run' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    view.rerender(
      <ActivitiesPage
        activities={[trip]}
        units="metric"
        records={new Map()}
        keptIds={new Map([['new', 'saved-new']])}
        onDelete={vi.fn()}
        libraryError="Could not delete this activity. Try again."
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete this activity. Try again.',
    )
    expect(screen.getByRole('link', { name: 'New run' })).toBeInTheDocument()
  })

  it('follows the address when it changes, so a plain Activities link resets the sort and page', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '#/activities')
    render(<ActivitiesPage activities={trip ? [trip] : []} units="metric" records={new Map()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'distance')
    expect(window.location.hash).toBe('#/activities?sort=distance')
    window.location.hash = '#/activities'
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('newest'),
    )
  })
})

describe('ActivitiesPage announces a removal from the activity page', () => {
  const trip = makeActivity({
    id: 'new',
    name: 'New run',
    startMs: new Date(2026, 5, 1, 7).getTime(),
  })

  it('announces the removal the activity page made, and takes the marker out of the address', () => {
    window.history.replaceState(null, '', '#/activities?removed=1')
    render(
      <ActivitiesPage
        activities={[]}
        units="metric"
        records={new Map()}
        libraryNotice="Deleted New run."
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Deleted New run.')
    expect(window.location.hash).toBe('#/activities')
  })

  it('does not announce a notice that was left from before, when the list is opened without the marker', () => {
    window.history.replaceState(null, '', '#/activities')
    render(
      <ActivitiesPage
        activities={[trip]}
        units="metric"
        records={new Map()}
        libraryNotice="Deleted New run."
      />,
    )
    expect(screen.queryByText('Deleted New run.')).not.toBeInTheDocument()
  })
})

describe('ActivitiesPage clears a delete outcome when the list changes', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    makeActivity({
      id: `r-${i}`,
      name: `Run ${i}`,
      startMs: new Date(2026, 5, 1, 7).getTime() - i * DAY_MS,
    }),
  )

  it('clears the outcome when the sort changes, so an old "Deleted" does not linger', async () => {
    const user = userEvent.setup()
    const view = render(
      <ActivitiesPage
        activities={many}
        units="metric"
        records={new Map()}
        keptIds={new Map([['r-0', 'saved-0']])}
        onDelete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete Run 0' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    view.rerender(
      <ActivitiesPage
        activities={many.slice(1)}
        units="metric"
        records={new Map()}
        keptIds={new Map()}
        onDelete={vi.fn()}
        libraryNotice="Deleted Run 0."
      />,
    )
    expect(screen.getByText('Deleted Run 0.')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'distance')
    expect(screen.queryByText('Deleted Run 0.')).not.toBeInTheDocument()
  })

  it('clears the outcome when the page changes', async () => {
    const user = userEvent.setup()
    const view = render(
      <ActivitiesPage
        activities={many}
        units="metric"
        records={new Map()}
        keptIds={new Map([['r-0', 'saved-0']])}
        onDelete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete Run 0' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    view.rerender(
      <ActivitiesPage
        activities={many.slice(1)}
        units="metric"
        records={new Map()}
        keptIds={new Map()}
        onDelete={vi.fn()}
        libraryError="Could not delete."
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete.')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("announces a removal the activity page made in the list's own status line, and the text sits in it", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '#/activities/new')
    const trip = makeActivity({
      id: 'new',
      name: 'New run',
      startMs: new Date(2026, 5, 1, 7).getTime(),
    })
    const list = render(
      <ActivitiesPage
        activities={[trip]}
        units="metric"
        records={new Map()}
        keptIds={new Map([['new', 'saved-new']])}
        onDelete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete New run' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    list.unmount()
    window.history.replaceState(null, '', '#/activities?removed=1')
    render(
      <ActivitiesPage
        activities={[]}
        units="metric"
        records={new Map()}
        libraryNotice="Deleted New run."
      />,
    )
    const text = screen.getByText('Deleted New run.')
    expect(text.closest('[role="status"]')).not.toBeNull()
    expect(window.location.hash).toBe('#/activities')
  })
})

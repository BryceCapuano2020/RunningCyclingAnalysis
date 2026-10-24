// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
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

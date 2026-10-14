// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../core/pipeline'
import { makeActivity } from './fixtures'
import { ActivitiesTable } from './ActivitiesTable'

afterEach(() => {
  cleanup()
})

function renderTable(activities: ActivitySummary[]) {
  return render(<ActivitiesTable activities={activities} units="metric" />)
}

function rowFor(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(name) })
}

describe('ActivitiesTable', () => {
  it('shows the date in UTC, the sport, time, distance, climb and heart-rate columns', () => {
    renderTable([
      makeActivity({
        id: 'run',
        name: 'Tempo run',
        sport: 'run',
        startMs: Date.UTC(2026, 0, 5, 23, 30),
        durationS: 3600,
        distanceM: 10000,
        elevationGainM: 120,
        hasHeartRate: true,
      }),
    ])
    const row = within(rowFor('Tempo run'))
    expect(row.getByText('2026-01-05')).toBeInTheDocument()
    expect(row.getByText('Run')).toBeInTheDocument()
    expect(row.getByText('1 h')).toBeInTheDocument()
    expect(row.getByText('10.00 km')).toBeInTheDocument()
    expect(row.getByText('120 m')).toBeInTheDocument()
    expect(row.getByText('Yes')).toBeInTheDocument()
  })

  it('labels the sport swatch with text, not only colour', () => {
    renderTable([makeActivity({ name: 'Hill ride', sport: 'ride' })])
    const row = within(rowFor('Hill ride'))
    expect(row.getByText('Ride')).toBeInTheDocument()
  })

  it('shows how power was obtained for each activity', () => {
    renderTable([
      makeActivity({ id: 'm', name: 'Power ride', sport: 'ride', powerSource: 'measured' }),
      makeActivity({ id: 'v', name: 'Climb ride', sport: 'ride', powerSource: 'virtual' }),
      makeActivity({ id: 'n', name: 'Plain run', sport: 'run', powerSource: 'none' }),
    ])
    expect(within(rowFor('Power ride')).getByText('Measured')).toBeInTheDocument()
    expect(within(rowFor('Climb ride')).getByText('Estimated on climbs')).toBeInTheDocument()
    expect(within(rowFor('Plain run')).getByText('—')).toBeInTheDocument()
  })

  it('says No for activities without heart-rate data', () => {
    renderTable([makeActivity({ name: 'Treadmill run', hasHeartRate: false })])
    expect(within(rowFor('Treadmill run')).getByText('No')).toBeInTheDocument()
  })

  it('shows None when an activity has no data issues', () => {
    renderTable([makeActivity({ name: 'Clean run', flags: [] })])
    expect(within(rowFor('Clean run')).getByText('None')).toBeInTheDocument()
    expect(within(rowFor('Clean run')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the issue count as a button that expands each flag with its time range', () => {
    renderTable([
      makeActivity({
        name: 'Noisy run',
        flags: [
          {
            kind: 'hr-dropout',
            start: 65,
            end: 125,
            message: 'Heart rate read zero for over ten seconds',
          },
          { kind: 'speed-spike', start: 300, end: 301, message: 'Speed jumped to 40 m/s' },
        ],
      }),
    ])
    const toggle = within(rowFor('Noisy run')).getByRole('button', { name: '2 issues' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByText('Heart rate read zero for over ten seconds (1 min 5 s to 2 min 5 s)'),
    ).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('Heart rate read zero for over ten seconds (1 min 5 s to 2 min 5 s)'),
    ).toBeInTheDocument()
    expect(screen.getByText('Speed jumped to 40 m/s (5 min to 5 min 1 s)')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByText('Speed jumped to 40 m/s (5 min to 5 min 1 s)'),
    ).not.toBeInTheDocument()
  })

  it('uses the singular for one issue', () => {
    renderTable([
      makeActivity({
        name: 'One issue run',
        flags: [{ kind: 'power-spike', start: 0, end: 1, message: 'Power spiked' }],
      }),
    ])
    expect(
      within(rowFor('One issue run')).getByRole('button', { name: '1 issue' }),
    ).toBeInTheDocument()
  })

  it('shows the first 20 rows, then reveals the rest with Show all', () => {
    const activities = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderTable(activities)
    // One header row plus 20 data rows.
    expect(screen.getAllByRole('row')).toHaveLength(21)

    fireEvent.click(screen.getByRole('button', { name: 'Show all 25' }))
    expect(screen.getAllByRole('row')).toHaveLength(26)
    expect(screen.queryByRole('button', { name: 'Show all 25' })).not.toBeInTheDocument()
  })

  it('shows no Show all button for 20 or fewer activities', () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderTable(activities)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('says there are no activities when the list is empty', () => {
    renderTable([])
    expect(screen.getByText('No activities yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

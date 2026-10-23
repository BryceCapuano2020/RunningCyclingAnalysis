// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { makeActivity } from './fixtures'
import { ActivitiesTable } from './ActivitiesTable'
import { readStylesheet, ruleBody } from './stylesheet'

const tableCss = await readStylesheet(import.meta.url, './ActivitiesTable.css')

beforeAll(() => {
  // Pins the viewer's zone so the date assertions do not depend on the machine running them.
  vi.stubEnv('TZ', 'America/Los_Angeles')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

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
  it('shows the date in the local zone, the sport, time, distance, climb and heart-rate columns', () => {
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

  it('shows the local date of an evening activity, not the UTC date', () => {
    // 02:30 UTC on 1 June is 19:30 on 31 May in Los Angeles.
    renderTable([makeActivity({ name: 'Evening run', startMs: Date.UTC(2025, 5, 1, 2, 30) })])
    const row = within(rowFor('Evening run'))
    expect(row.getByText('2025-05-31')).toBeInTheDocument()
    expect(row.queryByText('2025-06-01')).not.toBeInTheDocument()
  })

  it('marks Climb, Power and Heart rate as hidden on narrow screens, keeping the cells', () => {
    const { container } = renderTable([makeActivity({ name: 'Narrow run' })])
    const optional = container.querySelectorAll('.activities-table__optional')
    // One header cell and one body cell each for Climb, Power and Heart rate.
    expect(optional).toHaveLength(6)
    expect(within(rowFor('Narrow run')).getByText('120 m')).toBeInTheDocument()
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
    // The panel stays mounted and is hidden until expanded.
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).not.toBeNull()
    expect(
      screen.getByText('Heart rate read zero for over ten seconds (1 min 5 s to 2 min 5 s)'),
    ).not.toBeVisible()

    toggle.focus()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // The button stays mounted, so it keeps focus.
    expect(toggle).toHaveFocus()
    expect(
      screen.getByText('Heart rate read zero for over ten seconds (1 min 5 s to 2 min 5 s)'),
    ).toBeVisible()
    expect(screen.getByText('Speed jumped to 40 m/s (5 min to 5 min 1 s)')).toBeVisible()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Speed jumped to 40 m/s (5 min to 5 min 1 s)')).not.toBeVisible()
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

  it('pages through activities and moves focus to the first row on the new page', () => {
    const activities = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderTable(activities)
    // One header row plus 20 data rows.
    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(screen.getByText('Showing 1–20 of 25 activities. Page 1 of 2.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getAllByRole('row')).toHaveLength(6)
    expect(screen.getByText('Showing 21–25 of 25 activities. Page 2 of 2.')).toBeVisible()
    expect(rowFor('Run number 20')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Run number 0/ })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(rowFor('Run number 20'))

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(rowFor('Run number 0')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Run number 20/ })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(rowFor('Run number 0'))
  })

  it('keeps the activity DOM bounded to one page for a 5,000-activity library', () => {
    const flags = Array.from({ length: 50 }, (_, i) => ({
      kind: 'power-spike' as const,
      start: i,
      end: i + 1,
      message: `Power spike ${i}`,
    }))
    const activities = Array.from({ length: 5000 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}`, flags }),
    )
    const { container } = renderTable(activities)

    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(container.querySelectorAll('tbody > tr')).toHaveLength(40)
    expect(container.querySelectorAll('.activities-table__flags li')).toHaveLength(1000)
    expect(screen.getByText('Showing 1–20 of 5000 activities. Page 1 of 250.')).toBeVisible()
    for (const button of screen.getAllByRole('button', { name: '50 issues' })) {
      expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).not.toBeNull()
    }
  })

  it('resets to page one when the selected activity library shrinks', () => {
    const activities = Array.from({ length: 45 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    const view = renderTable(activities)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 41–45 of 45 activities. Page 3 of 3.')).toBeVisible()

    view.rerender(<ActivitiesTable activities={activities.slice(0, 25)} units="metric" />)
    expect(screen.getByText('Showing 1–20 of 25 activities. Page 1 of 2.')).toBeVisible()
    expect(rowFor('Run number 0')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Run number 40/ })).not.toBeInTheDocument()

    view.rerender(<ActivitiesTable activities={activities.slice(0, 15)} units="metric" />)
    expect(screen.queryByRole('navigation', { name: 'Activity pages' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(16)
  })

  it('shows no pagination for 20 or fewer activities', () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderTable(activities)
    expect(screen.queryByRole('navigation', { name: 'Activity pages' })).not.toBeInTheDocument()
  })

  it('says there are no activities when the list is empty', () => {
    renderTable([])
    expect(screen.getByText('No activities yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lets a long activity title wrap, so the Data issues column stays on screen at 320 px', () => {
    const longName =
      'Sunday long ride with a very long descriptive title that keeps going and going'
    renderTable([makeActivity({ id: 'long', name: longName, sport: 'ride' })])
    expect(screen.getByText(longName)).toHaveClass('activities-table__name')
    expect(screen.getByText(longName).closest('td')).not.toBeNull()

    const rule = ruleBody(tableCss, '.activities-table__name')
    expect(rule).toMatch(/white-space:\s*normal/)
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule).toMatch(/max-width:\s*20rem/)
    expect(rule).toMatch(/display:\s*block/)
  })
})

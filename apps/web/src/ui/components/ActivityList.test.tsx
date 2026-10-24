// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { UnitSystem } from '@rca/core/units'
import { makeActivity } from './fixtures'
import { ActivityList } from './ActivityList'
import { readStylesheet, ruleBody } from './stylesheet'

const listCss = await readStylesheet(import.meta.url, './ActivityList.css')

// A fixed clock, so the year shown on each date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeAll(() => {
  // Pins the viewer's zone so the date assertions do not depend on the machine running them.
  vi.stubEnv('TZ', 'America/Los_Angeles')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderList(
  activities: ActivitySummary[],
  units: UnitSystem = 'metric',
  records: ReadonlyMap<string, readonly EarnedRecord[]> = new Map(),
) {
  return render(<ActivityList activities={activities} units={units} records={records} />)
}

/** The list item that holds the activity's name link. */
function rowFor(name: string): HTMLElement {
  const row = screen.getByRole('link', { name }).closest('li')
  if (!row) throw new Error(`No list item holds ${name}`)
  return row
}

function rowsShown(): HTMLElement[] {
  return screen.getAllByRole('listitem')
}

const flag = (message: string) => ({
  kind: 'hr-dropout' as const,
  start: 65,
  end: 125,
  message,
})

describe('ActivityList', () => {
  it('links each name to its activity page, beside the sport and the friendly date', () => {
    renderList([
      makeActivity({
        id: 'run-1',
        name: 'Tempo run',
        startMs: new Date(2026, 0, 5, 7, 30).getTime(),
      }),
    ])
    expect(screen.getByRole('link', { name: 'Tempo run' })).toHaveAttribute(
      'href',
      '#/activities/run-1',
    )
    const row = within(rowFor('Tempo run'))
    expect(row.getByText('Run')).toBeInTheDocument()
    expect(row.getByText('Mon 5 Jan')).toBeInTheDocument()
  })

  it('shows the local date of an evening activity, not the UTC date', () => {
    // 02:30 UTC on 1 June is 19:30 on 31 May in Los Angeles.
    renderList([makeActivity({ name: 'Evening run', startMs: Date.UTC(2026, 5, 1, 2, 30) })])
    expect(within(rowFor('Evening run')).getByText('Sun 31 May')).toBeInTheDocument()
    expect(screen.queryByText('Mon 1 Jun')).not.toBeInTheDocument()
  })

  it('shows a run as its time, distance and average pace, with no climb', () => {
    renderList([
      makeActivity({
        name: 'Tempo run',
        sport: 'run',
        durationS: 3600,
        distanceM: 10000,
        elevationGainM: 120,
      }),
    ])
    const row = within(rowFor('Tempo run'))
    expect(row.getByText('1 h')).toBeInTheDocument()
    expect(row.getByText('10.00 km')).toBeInTheDocument()
    expect(row.getByText('6:00 /km')).toBeInTheDocument()
    expect(row.queryByText('120 m')).not.toBeInTheDocument()
  })

  it('shows a ride with its climb and no pace', () => {
    renderList([
      makeActivity({
        name: 'Hill ride',
        sport: 'ride',
        durationS: 3600,
        distanceM: 40000,
        elevationGainM: 420,
      }),
    ])
    const row = within(rowFor('Hill ride'))
    expect(row.getByText('Ride')).toBeInTheDocument()
    expect(row.getByText('420 m')).toBeInTheDocument()
    expect(row.queryByText(/\/km/)).not.toBeInTheDocument()
  })

  it('leaves out a zero climb on a ride', () => {
    renderList([makeActivity({ name: 'Flat ride', sport: 'ride', elevationGainM: 0 })])
    expect(within(rowFor('Flat ride')).queryByText('0 m')).not.toBeInTheDocument()
  })

  it('uses miles and minutes per mile in imperial units', () => {
    renderList([makeActivity({ name: 'Tempo run', durationS: 3600, distanceM: 10000 })], 'imperial')
    const row = within(rowFor('Tempo run'))
    expect(row.getByText('6.21 mi')).toBeInTheDocument()
    expect(row.getByText('9:39 /mi')).toBeInTheDocument()
  })

  it('shows a warning chip with the count of data issues, only on activities that have some', () => {
    renderList([
      makeActivity({ id: 'clean', name: 'Clean run', flags: [] }),
      makeActivity({
        id: 'noisy',
        name: 'Noisy run',
        flags: [flag('Heart rate read zero'), flag('Speed jumped'), flag('Power spiked')],
      }),
    ])
    expect(within(rowFor('Noisy run')).getByText('3 data issues')).toBeInTheDocument()
    expect(within(rowFor('Clean run')).queryByText(/data issue/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/data issue/)).toHaveLength(1)
  })

  it('uses the singular for one data issue', () => {
    renderList([makeActivity({ name: 'One issue run', flags: [flag('Heart rate read zero')] })])
    expect(within(rowFor('One issue run')).getByText('1 data issue')).toBeInTheDocument()
  })

  it('is a list rather than a table, so it reflows on a phone', () => {
    renderList([
      makeActivity({ id: 'a', name: 'First run' }),
      makeActivity({ id: 'b', name: 'Second run' }),
    ])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(rowsShown()).toHaveLength(2)
  })

  it('wraps long names at spaces rather than inside words', () => {
    const longName =
      'Sunday long ride with a very long descriptive title that keeps going and going'
    renderList([makeActivity({ id: 'long', name: longName, sport: 'ride' })])
    expect(screen.getByRole('link', { name: longName })).toHaveClass('activity-list__name')

    const rule = ruleBody(listCss, '.activity-list__name')
    expect(rule).toMatch(/overflow-wrap:\s*break-word/)
    expect(rule).not.toMatch(/anywhere/)
  })

  it('mounts the page status before a second page exists, so its first message is announced', () => {
    const activity = (i: number) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })
    const { rerender } = renderList(Array.from({ length: 20 }, (_, i) => activity(i)))
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    rerender(
      <ActivityList
        activities={Array.from({ length: 25 }, (_, i) => activity(i))}
        units="metric"
        records={new Map()}
      />,
    )
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Showing 1–20 of 25 activities. Page 1 of 2.')
  })

  it('pages through activities and moves focus to the first row on the new page', () => {
    const activities = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderList(activities)
    expect(rowsShown()).toHaveLength(20)
    expect(screen.getByText('Showing 1–20 of 25 activities. Page 1 of 2.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rowsShown()).toHaveLength(5)
    expect(screen.getByText('Showing 21–25 of 25 activities. Page 2 of 2.')).toBeVisible()
    expect(rowFor('Run number 20')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Run number 0' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(rowFor('Run number 20'))

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(rowsShown()).toHaveLength(20)
    expect(rowFor('Run number 0')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Run number 20' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(rowFor('Run number 0'))
  })

  it('keeps the DOM bounded to one page for a 5,000-activity library', () => {
    const flags = [flag('Heart rate read zero')]
    const activities = Array.from({ length: 5000 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}`, flags }),
    )
    renderList(activities)

    expect(rowsShown()).toHaveLength(20)
    expect(screen.getAllByText('1 data issue')).toHaveLength(20)
    expect(screen.getByText('Showing 1–20 of 5000 activities. Page 1 of 250.')).toBeVisible()
  })

  it('resets to page one when the selected activity library shrinks', () => {
    const activities = Array.from({ length: 45 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    const view = renderList(activities)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 41–45 of 45 activities. Page 3 of 3.')).toBeVisible()

    view.rerender(
      <ActivityList activities={activities.slice(0, 25)} units="metric" records={new Map()} />,
    )
    expect(screen.getByText('Showing 1–20 of 25 activities. Page 1 of 2.')).toBeVisible()
    expect(rowFor('Run number 0')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Run number 40' })).not.toBeInTheDocument()

    view.rerender(
      <ActivityList activities={activities.slice(0, 15)} units="metric" records={new Map()} />,
    )
    expect(screen.queryByRole('navigation', { name: 'Activity pages' })).not.toBeInTheDocument()
    expect(rowsShown()).toHaveLength(15)
  })

  it('moves focus to the first row when the pager goes away while it holds focus', () => {
    const activities = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    const view = renderList(activities)
    const next = screen.getByRole('button', { name: 'Next page' })
    next.focus()

    view.rerender(
      <ActivityList activities={activities.slice(0, 15)} units="metric" records={new Map()} />,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(rowFor('Run number 0'))
  })

  it('shows no pagination for 20 or fewer activities, and no unnamed landmark either', () => {
    const activities = Array.from({ length: 20 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderList(activities)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Activity pages' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows the sport word beside its icon in each row', () => {
    renderList([makeActivity({ name: 'Hill ride', sport: 'ride' })])
    const sport = within(rowFor('Hill ride')).getByText('Ride')
    expect(sport).toHaveClass('activity-list__sport')
    expect(sport.querySelector('svg')).toHaveClass('activity-list__icon--ride')
  })
})

/** The chip labels in a records group, in the order they are shown. */
function chipTexts(group: HTMLElement): (string | null)[] {
  return within(group)
    .getAllByText(/^Best /)
    .map((chip) => chip.textContent)
}

describe('ActivityList records earned', () => {
  const run = makeActivity({ id: 'run-1', name: 'Morning run' })
  const other = makeActivity({ id: 'run-2', name: 'Evening run', startMs: NOW - 86_400_000 })

  it('names the records an activity holds as chips, in the order given', () => {
    const records = new Map<string, EarnedRecord[]>([
      [
        'run-1',
        [
          { kind: 'duration', durationS: 1200 },
          { kind: 'distance', distanceM: 5000 },
        ],
      ],
    ])
    renderList([run], 'metric', records)
    const group = screen.getByRole('group', { name: 'All-time records' })
    expect(within(group).getByText('Best 20 min')).toBeTruthy()
    expect(chipTexts(group)).toEqual(['Best 20 min', 'Best 5 km'])
    expect(within(group).queryByText(/more/)).toBeNull()
  })

  it('shows at most two chips and says how many more the activity holds', () => {
    const records = new Map<string, EarnedRecord[]>([
      [
        'run-1',
        [
          { kind: 'duration', durationS: 300 },
          { kind: 'duration', durationS: 1200 },
          { kind: 'duration', durationS: 3600 },
          { kind: 'distance', distanceM: 5000 },
        ],
      ],
    ])
    renderList([run], 'metric', records)
    const group = screen.getByRole('group', { name: 'All-time records' })
    expect(chipTexts(group)).toEqual(['Best 5 min', 'Best 20 min'])
    expect(within(group).getByText('+2 more records')).toBeTruthy()
  })

  it('gives chips only to the row of the activity that holds them', () => {
    const records: ReadonlyMap<string, EarnedRecord[]> = new Map([
      ['run-1', [{ kind: 'distance', distanceM: 1000 }]],
    ])
    renderList([run, other], 'metric', records)
    const held = within(rowFor('Morning run')).getByRole('group', { name: 'All-time records' })
    expect(held).toBeTruthy()
    expect(
      within(rowFor('Evening run')).queryByRole('group', { name: 'All-time records' }),
    ).toBeNull()
  })

  it('shows no records group for an activity that holds nothing', () => {
    renderList([run])
    expect(screen.queryByRole('group', { name: 'All-time records' })).toBeNull()
  })
})

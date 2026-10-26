// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { UnitSystem } from '@rca/core/units'
import { makeActivity } from './fixtures'
import { ActivityList, type ActivityListProps } from './ActivityList'
import { readStylesheet, ruleBody } from './stylesheet'

const listCss = await readStylesheet(import.meta.url, './ActivityList.css')

// A fixed clock, so the year shown on each date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeAll(() => {
  // Pins the viewer's zone so the date and time assertions do not depend on the machine running them.
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
  extra: Partial<ActivityListProps> = {},
) {
  return render(
    <ActivityList
      signedIn={false}
      activities={activities}
      units={units}
      records={records}
      {...extra}
    />,
  )
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

describe('ActivityList rows', () => {
  it('links each name to its activity page, beside the sport and the day and time it started', () => {
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
    expect(row.getByText('Mon 5 Jan, 7:30 am')).toBeInTheDocument()
  })

  it('gives a row its weekday, day and month in date order, where a heading names the month', () => {
    renderList(
      [
        makeActivity({
          id: 'run-1',
          name: 'Tempo run',
          startMs: new Date(2026, 0, 5, 7, 30).getTime(),
        }),
      ],
      'metric',
      new Map(),
      { dateOrder: true },
    )
    expect(within(rowFor('Tempo run')).getByText('Mon 5, 7:30 am')).toBeInTheDocument()
  })

  it('shows the local day and time of an evening activity, not the UTC ones', () => {
    // 02:30 UTC on 1 June is 19:30 on 31 May in Los Angeles.
    renderList([makeActivity({ name: 'Evening run', startMs: Date.UTC(2026, 5, 1, 2, 30) })])
    expect(within(rowFor('Evening run')).getByText('Sun 31 May, 7:30 pm')).toBeInTheDocument()
  })

  it('labels a run its elapsed time, distance, climb and pace, when moving time is not kept', () => {
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
    expect(row.getByText('Elapsed time')).toBeInTheDocument()
    expect(row.getByText('1 h')).toBeInTheDocument()
    expect(row.getByText('Distance')).toBeInTheDocument()
    expect(row.getByText('10.0 km')).toBeInTheDocument()
    expect(row.getByText('Climb')).toBeInTheDocument()
    expect(row.getByText('120 m')).toBeInTheDocument()
    expect(row.getByText('Pace')).toBeInTheDocument()
    expect(row.getByText('6:00 /km')).toBeInTheDocument()
  })

  it('times a run by its moving time when it is kept, so pauses do not slow the pace', () => {
    renderList([
      makeActivity({ name: 'Paused run', durationS: 3600, movingS: 3000, distanceM: 10000 }),
    ])
    const row = within(rowFor('Paused run'))
    expect(row.getByText('Moving time')).toBeInTheDocument()
    expect(row.getByText('50 min')).toBeInTheDocument()
    expect(row.getByText('5:00 /km')).toBeInTheDocument()
  })

  it('shows a ride with its climb and its speed, and no pace', () => {
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
    expect(row.getByText('Speed')).toBeInTheDocument()
    expect(row.getByText('420 m')).toBeInTheDocument()
    expect(row.queryByText(/\/km/)).not.toBeInTheDocument()
  })

  it('leaves out a zero climb', () => {
    renderList([makeActivity({ name: 'Flat ride', sport: 'ride', elevationGainM: 0 })])
    expect(within(rowFor('Flat ride')).queryByText('Climb')).not.toBeInTheDocument()
  })

  it('leaves out the distance and speed of an indoor ride, and shows its average power', () => {
    renderList([
      makeActivity({
        name: 'Trainer ride',
        sport: 'ride',
        indoor: true,
        distanceM: 0,
        elevationGainM: 13,
        powerSource: 'measured',
        avgPowerW: 250,
      }),
    ])
    const row = within(rowFor('Trainer ride'))
    expect(row.getByText('Indoor')).toBeInTheDocument()
    expect(row.queryByText('Distance')).not.toBeInTheDocument()
    expect(row.queryByText('Speed')).not.toBeInTheDocument()
    expect(row.getByText('Power')).toBeInTheDocument()
    expect(row.getByText('250 W')).toBeInTheDocument()
  })

  it("marks an indoor ride's average power as estimated when no power meter measured it", () => {
    renderList([
      makeActivity({
        name: 'Zwift ride',
        sport: 'ride',
        indoor: true,
        distanceM: 0,
        powerSource: 'virtual',
        avgPowerW: 180,
      }),
    ])
    const row = within(rowFor('Zwift ride'))
    expect(row.getByText('180 W')).toBeInTheDocument()
    expect(row.getByText('Estimated')).toBeInTheDocument()
  })

  it('uses miles and minutes per mile in imperial units', () => {
    renderList([makeActivity({ name: 'Tempo run', durationS: 3600, distanceM: 10000 })], 'imperial')
    const row = within(rowFor('Tempo run'))
    expect(row.getByText('6.2 mi')).toBeInTheDocument()
    expect(row.getByText('9:39 /mi')).toBeInTheDocument()
  })

  it('shows a warning chip with the readings skipped, only on activities that have some', () => {
    renderList([
      makeActivity({ id: 'clean', name: 'Clean run', flags: [] }),
      makeActivity({
        id: 'noisy',
        name: 'Noisy run',
        flags: [flag('Heart rate read zero'), flag('Speed jumped'), flag('Power spiked')],
      }),
    ])
    expect(within(rowFor('Noisy run')).getByText('Readings skipped 3 times')).toBeInTheDocument()
    expect(within(rowFor('Clean run')).queryByText(/skipped/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/skipped/)).toHaveLength(1)
  })

  it('leaves altitude notes off the skipped chip, since they remove no reading', () => {
    renderList([
      makeActivity({
        name: 'Hilly run',
        flags: [],
        flagCounts: { 'altitude-jump': 2, 'missing-altitude': 1 },
      }),
    ])
    expect(within(rowFor('Hilly run')).queryByText(/skipped/)).not.toBeInTheDocument()
  })

  it('counts every reading skipped, not only the flags the digest keeps', () => {
    renderList([
      makeActivity({
        name: 'Noisy strap run',
        flags: [flag('Heart rate read zero')],
        flagCounts: { 'hr-dropout': 60 },
      }),
    ])
    expect(
      within(rowFor('Noisy strap run')).getByText('Readings skipped 60 times'),
    ).toBeInTheDocument()
  })

  it('says once for one reading skipped', () => {
    renderList([makeActivity({ name: 'One skip run', flags: [flag('Heart rate read zero')] })])
    expect(within(rowFor('One skip run')).getByText('Readings skipped once')).toBeInTheDocument()
  })

  it('is a list rather than a table, so it reflows on a phone', () => {
    renderList([
      makeActivity({ id: 'a', name: 'First run' }),
      makeActivity({ id: 'b', name: 'Second run' }),
    ])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(rowsShown()).toHaveLength(2)
  })

  it('wraps names at spaces, and lets one long word wrap inside its column', () => {
    const longName =
      'Sunday long ride with a very long descriptive title that keeps going and going'
    renderList([makeActivity({ id: 'long', name: longName, sport: 'ride' })])
    expect(screen.getByRole('link', { name: longName })).toHaveClass('activity-list__name')

    expect(ruleBody(listCss, '.activity-list__name')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(ruleBody(listCss, '.activity-list__body')).toMatch(
      /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/,
    )
  })

  it('shows the sport word beside its icon in each row', () => {
    renderList([makeActivity({ name: 'Hill ride', sport: 'ride' })])
    const sport = within(rowFor('Hill ride')).getByText('Ride')
    expect(sport).toHaveClass('activity-list__sport')
    expect(sport.querySelector('svg')).toHaveClass('activity-list__icon--ride')
  })
})

describe('ActivityList months', () => {
  // Built when each test runs, after beforeAll sets the zone, so the local times are the zone's own.
  const monthActivities = () => [
    makeActivity({ id: 'june', name: 'June run', startMs: new Date(2026, 5, 2, 7).getTime() }),
    makeActivity({ id: 'may', name: 'May run', startMs: new Date(2026, 4, 20, 9).getTime() }),
  ]

  it('heads each month once, with its year, when the list is in date order', () => {
    renderList(monthActivities(), 'metric', new Map(), { dateOrder: true })
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual(['Jun 2026', 'May 2026'])
    expect(within(rowFor('June run')).getByText('Tue 2, 7:00 am')).toBeInTheDocument()
  })

  it('shows no month headings for a list in any other order', () => {
    renderList(monthActivities())
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })
})

describe('ActivityList paging', () => {
  // jsdom has no layout, so it has no scrollIntoView; a page turn scrolls the list to its top.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('mounts the page status before a second page exists, so its first message is announced', () => {
    const activity = (i: number) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })
    const { rerender } = renderList(Array.from({ length: 20 }, (_, i) => activity(i)))
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    rerender(
      <ActivityList
        signedIn={false}
        activities={Array.from({ length: 25 }, (_, i) => activity(i))}
        units="metric"
        records={new Map()}
      />,
    )
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Showing 1–20 of 25 activities. Page 1 of 2.')
  })

  it('keeps focus on Next page while a page follows the one shown', async () => {
    const user = userEvent.setup()
    renderList(
      Array.from({ length: 45 }, (_, i) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })),
    )
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 21–40 of 45 activities. Page 2 of 3.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveFocus()
  })

  it('moves focus to the first row once the pressed control is disabled on the last page', async () => {
    const user = userEvent.setup()
    renderList(
      Array.from({ length: 45 }, (_, i) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })),
    )
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rowFor('Run number 40')).toHaveFocus()
  })

  it('announces the new range in the page status when a numbered page is pressed', async () => {
    const user = userEvent.setup()
    renderList(
      Array.from({ length: 45 }, (_, i) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })),
    )
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 21–40 of 45 activities. Page 2 of 3.',
    )
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

  it('moves the list to its top when a click turns the page', async () => {
    const user = userEvent.setup()
    const { container } = renderList(
      Array.from({ length: 45 }, (_, i) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })),
    )
    const list = container.querySelector<HTMLElement>('.activity-list')
    if (list === null) throw new Error('No list is shown')
    list.scrollIntoView = vi.fn()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(list.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  })

  it('does not move the list when the page is given by the address', () => {
    // The spy is installed before the first render, so a scroll on mount is seen.
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    renderList(
      Array.from({ length: 45 }, (_, i) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })),
      'metric',
      new Map(),
      { initialPage: 1 },
    )
    expect(screen.getByText('Showing 21–40 of 45 activities. Page 2 of 3.')).toBeVisible()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('moves focus to the first row when the pressed control is below the screen once the page turns', async () => {
    const user = userEvent.setup()
    renderList(
      Array.from({ length: 45 }, (_, i) => makeActivity({ id: `a-${i}`, name: `Run number ${i}` })),
    )
    const next = screen.getByRole('button', { name: 'Next page' })
    next.getBoundingClientRect = () => ({ top: 1200 }) as DOMRect
    await user.click(next)
    expect(rowFor('Run number 20')).toHaveFocus()
  })

  it('starts on the page it is given, and tells each page change', () => {
    const onPageChange = vi.fn()
    const activities = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}` }),
    )
    renderList(activities, 'metric', new Map(), { initialPage: 1, onPageChange })
    expect(screen.getByText('Showing 21–25 of 25 activities. Page 2 of 2.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenCalledWith(0)
  })

  it('keeps the DOM bounded to one page for a 5,000-activity library', () => {
    const flags = [flag('Heart rate read zero')]
    const activities = Array.from({ length: 5000 }, (_, i) =>
      makeActivity({ id: `a-${i}`, name: `Run number ${i}`, flags }),
    )
    renderList(activities)

    expect(rowsShown()).toHaveLength(20)
    expect(screen.getAllByText('Readings skipped once')).toHaveLength(20)
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
      <ActivityList
        signedIn={false}
        activities={activities.slice(0, 25)}
        units="metric"
        records={new Map()}
      />,
    )
    expect(screen.getByText('Showing 1–20 of 25 activities. Page 1 of 2.')).toBeVisible()
    expect(rowFor('Run number 0')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Run number 40' })).not.toBeInTheDocument()

    view.rerender(
      <ActivityList
        signedIn={false}
        activities={activities.slice(0, 15)}
        units="metric"
        records={new Map()}
      />,
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
      <ActivityList
        signedIn={false}
        activities={activities.slice(0, 15)}
        units="metric"
        records={new Map()}
      />,
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
})

describe('ActivityList deleting', () => {
  const kept = makeActivity({ id: 'kept', name: 'Morning run' })
  const sample = makeActivity({ id: 'sample', name: 'Sample run' })

  it('offers Delete only on an activity kept in the library, and removes it by its saved copy', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    renderList([kept, sample], 'metric', new Map(), {
      keptIds: new Map([['kept', 'saved-kept']]),
      onDelete,
    })
    expect(
      within(rowFor('Sample run')).queryByRole('button', { name: /Delete/ }),
    ).not.toBeInTheDocument()

    await user.click(
      within(rowFor('Morning run')).getByRole('button', { name: 'Delete Morning run' }),
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('saved-kept')
  })

  it('offers no Delete while a removal is running', () => {
    renderList([kept], 'metric', new Map(), {
      keptIds: new Map([['kept', 'saved-kept']]),
      onDelete: vi.fn(),
      busy: true,
    })
    expect(
      within(rowFor('Morning run')).getByRole('button', { name: 'Delete Morning run' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('ActivityList records earned', () => {
  /** The chip labels in a records group, in the order they are shown. */
  function chipTexts(group: HTMLElement): (string | null)[] {
    return within(group)
      .getAllByText(/^Best /)
      .map((chip) => chip.textContent)
  }

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

describe('ActivityList ride records and the weight', () => {
  const ride = makeActivity({ id: 'ride-1', name: 'Hill ride', sport: 'ride' })
  const records = new Map<string, EarnedRecord[]>([
    ['ride-1', [{ kind: 'duration', durationS: 1200 }]],
  ])

  it("holds a ride's record chips until the weight is entered, as the activity page does", () => {
    renderList([ride], 'metric', records, { weightKnown: false })
    expect(screen.queryByRole('group', { name: 'All-time records' })).toBeNull()
  })

  it("shows a ride's record chips once the weight is known", () => {
    renderList([ride], 'metric', records, { weightKnown: true })
    expect(screen.getByRole('group', { name: 'All-time records' })).toBeTruthy()
  })

  it("keeps a run's record chips whatever the weight", () => {
    const run = makeActivity({ id: 'run-1', name: 'Morning run' })
    renderList([run], 'metric', records, { weightKnown: false })
    expect(
      within(rowFor('Morning run')).queryByRole('group', { name: 'All-time records' }),
    ).toBeNull()
    const runRecords = new Map<string, EarnedRecord[]>([
      ['run-1', [{ kind: 'duration', durationS: 1200 }]],
    ])
    cleanup()
    renderList([run], 'metric', runRecords, { weightKnown: false })
    expect(screen.getByRole('group', { name: 'All-time records' })).toBeTruthy()
  })
})

describe('ActivityList indoor rides', () => {
  it('shows an indoor ride with a distance and no speed, in its row', () => {
    renderList([
      makeActivity({
        name: 'Zwift ride',
        sport: 'ride',
        indoor: true,
        distanceM: 20000,
        elevationGainM: 0,
      }),
    ])
    const row = within(rowFor('Zwift ride'))
    expect(row.getByText('Distance')).toBeInTheDocument()
    expect(row.queryByText('Speed')).not.toBeInTheDocument()
  })
})

describe('ActivityList sessions', () => {
  const upload = 'upload-of-brick'
  const leg = (id: string, name: string, startMs: number, sport: 'run' | 'ride', key = upload) =>
    makeActivity({ id, name, sport, startMs, durationS: 3600, sessionKey: key })

  it('groups the legs of one upload under one session row, with the legs indented in order', () => {
    const start = new Date(2026, 5, 2, 7).getTime()
    renderList(
      [
        leg('run-a', 'Brick run', start, 'run'),
        leg('ride-a', 'Brick ride', start + 3_600_000, 'ride'),
        leg('run-b', 'Brick run to finish', start + 7_200_000, 'run'),
        makeActivity({ id: 'other', name: 'Other run', startMs: start - 86_400_000 }),
      ],
      'metric',
      new Map(),
      { dateOrder: true },
    )
    const group = screen.getByRole('group', { name: '3 legs in one session' })
    expect(within(group).getByText('3 h')).toBeInTheDocument()
    const legs = within(group)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(legs).toEqual(['Brick run', 'Brick ride', 'Brick run to finish'])
    expect(screen.getByRole('link', { name: 'Other run' })).toBeInTheDocument()
  })

  it('lists the legs of a session in the order they were ridden, even in a newest-first list', () => {
    const start = new Date(2026, 5, 2, 7).getTime()
    renderList(
      [
        leg('run-b', 'Brick run to finish', start + 7_200_000, 'run'),
        leg('ride-a', 'Brick ride', start + 3_600_000, 'ride'),
        leg('run-a', 'Brick run', start, 'run'),
      ],
      'metric',
      new Map(),
      { dateOrder: true },
    )
    const group = screen.getByRole('group', { name: '3 legs in one session' })
    const legs = within(group)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(legs).toEqual(['Brick run', 'Brick ride', 'Brick run to finish'])
  })

  it('shows two same-named uploads as two sessions, since each has its own key', () => {
    const start = new Date(2026, 5, 2, 7).getTime()
    renderList(
      [
        leg('a1', 'First brick run', start, 'run', 'hash-of-first-upload'),
        leg('a2', 'First brick ride', start + 3_600_000, 'ride', 'hash-of-first-upload'),
        leg('b1', 'Second brick run', start + 7_200_000, 'run', 'hash-of-second-upload'),
        leg('b2', 'Second brick ride', start + 10_800_000, 'ride', 'hash-of-second-upload'),
      ],
      'metric',
      new Map(),
      { dateOrder: true },
    )
    const groups = screen.getAllByRole('group', { name: '2 legs in one session' })
    expect(groups).toHaveLength(2)
    expect(
      within(groups[0]!)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['First brick run', 'First brick ride'])
    expect(
      within(groups[1]!)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Second brick run', 'Second brick ride'])
  })

  it('does not group legs with no session key, or legs that are not next to each other', () => {
    const start = new Date(2026, 5, 2, 7).getTime()
    renderList(
      [
        makeActivity({ id: 'a', name: 'Run A', startMs: start, sessionKey: upload }),
        makeActivity({ id: 'b', name: 'Run B', startMs: start - 3_600_000 }),
        makeActivity({ id: 'c', name: 'Run C', startMs: start - 7_200_000, sessionKey: upload }),
      ],
      'metric',
      new Map(),
      { dateOrder: true },
    )
    expect(screen.queryByRole('group', { name: /legs in one session/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Run A' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run C' })).toBeInTheDocument()
  })

  it('shows the legs as rows of their own in a sort that is not by date', () => {
    const start = new Date(2026, 5, 2, 7).getTime()
    renderList(
      [
        leg('run-a', 'Brick run', start, 'run'),
        leg('ride-a', 'Brick ride', start + 3_600_000, 'ride'),
      ],
      'metric',
      new Map(),
      { dateOrder: false },
    )
    expect(screen.queryByRole('group', { name: /legs in one session/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Brick run' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Brick ride' })).toBeInTheDocument()
  })

  it('keeps a session whole when it falls at a page boundary, and counts its activities in the summary', () => {
    const start = new Date(2026, 5, 2, 7).getTime()
    const singles = Array.from({ length: 19 }, (_, i) =>
      makeActivity({ id: `s-${i}`, name: `Single ${i}`, startMs: start - (i + 1) * 86_400_000 }),
    )
    const session = [0, 1, 2].map((i) =>
      leg(`leg-${i}`, `Leg ${i}`, start - (20 + i) * 3_600_000, 'run', 'upload-at-edge'),
    )
    const tail = Array.from({ length: 5 }, (_, i) =>
      makeActivity({ id: `t-${i}`, name: `Tail ${i}`, startMs: start - (40 + i) * 86_400_000 }),
    )
    renderList([...singles, ...session, ...tail], 'metric', new Map(), { dateOrder: true })
    expect(screen.getByRole('group', { name: '3 legs in one session' })).toBeInTheDocument()
    expect(screen.getByText('Showing 1–22 of 27 activities. Page 1 of 2.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('link', { name: 'Tail 0' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /legs in one session/ })).toBeNull()
  })
})

// @vitest-environment jsdom
import type { Period } from '@rca/core/period'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { DigestSplits } from '@rca/core/types'
import { curveOf, rideCurveFixture, runCurveFixture } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import type { RouteReply } from '../routeReply'
import type { ActivityPageProps } from './ActivityPage'
import { ActivityPage } from './ActivityPage'

// A fixed clock, so the year shown on the date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The library's best efforts are set by the activity whose id is 'activity-1'. */
function resultWith(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return makeResult({ runCurve: runCurveFixture, rideCurve: rideCurveFixture, ...overrides })
}

/** No saved record and no route: the sample, or an activity this visitor has not kept. */
const NO_ROUTE = { routeId: null, loadRoute: async (): Promise<RouteReply> => ({ kind: 'none' }) }

function renderPage(
  activity: ActivitySummary | null,
  result: AnalysisResult = resultWith(),
  units: 'metric' | 'imperial' = 'metric',
  records: ReadonlyMap<string, readonly EarnedRecord[]> = new Map(),
  loadSplits: (id: string) => Promise<DigestSplits | null> = vi.fn(async () => null),
  route: Pick<ActivityPageProps, 'routeId' | 'loadRoute'> = NO_ROUTE,
  period?: Period,
) {
  // As in the app, the page's activity is one of the result's activities.
  const activities = activity ? [activity, ...result.activities] : result.activities
  return render(
    <ActivityPage
      activity={activity}
      result={{ ...result, activities }}
      units={units}
      massKg={70}
      records={records}
      loadSplits={loadSplits}
      period={period}
      {...route}
    />,
  )
}

/** The period the bests are counted over, dated from 12 May to 3 August 2025. */
const DATED: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

/** The stat whose label is `label`; its value sits in the same group. */
function statFor(label: string): HTMLElement {
  const parent = screen.getByText(label, { selector: 'dt' }).parentElement
  if (!parent) throw new Error(`No stat labelled ${label}`)
  return parent
}

const morningRun = makeActivity({
  id: 'activity-1',
  name: 'Morning run',
  sport: 'run',
  startMs: new Date(2026, 0, 5, 7, 30).getTime(),
  durationS: 3600,
  distanceM: 10000,
  elevationGainM: 120,
  hasHeartRate: true,
  powerSource: 'none',
})

const powerRide = makeActivity({
  id: 'activity-1',
  name: 'Hill ride',
  sport: 'ride',
  startMs: new Date(2026, 0, 5, 16, 15).getTime(),
  durationS: 5400,
  distanceM: 45000,
  elevationGainM: 610,
  powerSource: 'measured',
})

/** Two whole kilometres: the first slower, so the second is the fastest. */
const twoKilometres: DigestSplits = {
  km: [
    {
      distanceM: 1000,
      seconds: 300,
      gradeAdjustedSeconds: 290,
      elevationGainM: 12,
      avgHeartRate: 150,
    },
    {
      distanceM: 1000,
      seconds: 285,
      gradeAdjustedSeconds: 280,
      elevationGainM: 9,
      avgHeartRate: 155,
    },
  ],
  mile: [],
}

describe('ActivityPage', () => {
  it('says the activity is not found, and links back to the list, when the library does not hold it', () => {
    renderPage(null)
    const heading = screen.getByRole('heading', { level: 1, name: 'Activity not found' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(
      screen.getByText('It may have been deleted, or it is not in this library.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
  })

  it('shows a run with its sport, date, time and summary, and a link back to the list', () => {
    renderPage(morningRun)
    const heading = screen.getByRole('heading', { level: 1, name: 'Morning run' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('link', { name: 'Back to activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText('Mon 5 Jan')).toBeInTheDocument()
    expect(screen.getByText('7:30 am')).toBeInTheDocument()

    expect(within(statFor('Time')).getByText('1 h')).toBeInTheDocument()
    expect(within(statFor('Distance')).getByText('10.00 km')).toBeInTheDocument()
    expect(within(statFor('Climb')).getByText('120 m')).toBeInTheDocument()
    expect(within(statFor('Avg pace')).getByText('6:00 /km')).toBeInTheDocument()
    expect(within(statFor('Heart rate')).getByText('Recorded')).toBeInTheDocument()
    expect(screen.queryByText('Power', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('shows no heart rate as not recorded, and leaves out a zero climb', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
        name: 'Treadmill run',
        hasHeartRate: false,
        elevationGainM: 0,
      }),
    )
    expect(within(statFor('Heart rate')).getByText('Not recorded')).toBeInTheDocument()
    expect(screen.queryByText('Climb', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('shows a ride with its climb and no pace, and its power source', () => {
    renderPage(powerRide)
    expect(screen.getByText('Ride')).toBeInTheDocument()
    expect(within(statFor('Climb')).getByText('610 m')).toBeInTheDocument()
    expect(within(statFor('Power')).getByText('Power meter')).toBeInTheDocument()
    expect(screen.queryByText('Avg pace', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it.each([
    ['measured', 'Power meter'],
    ['virtual', 'Estimated on climbs'],
    ['none', 'None'],
  ] as const)('names a %s power source as %s', (powerSource, label) => {
    renderPage({ ...powerRide, powerSource })
    expect(within(statFor('Power')).getByText(label)).toBeInTheDocument()
  })

  it('shows a ride with its average speed', () => {
    renderPage(powerRide)
    expect(within(statFor('Avg speed')).getByText('30.0 km/h')).toBeInTheDocument()
    expect(screen.queryByText('Avg pace', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('shows a run in imperial units', () => {
    renderPage(morningRun, resultWith(), 'imperial')
    expect(within(statFor('Distance')).getByText('6.21 mi')).toBeInTheDocument()
    expect(within(statFor('Avg pace')).getByText('9:39 /mi')).toBeInTheDocument()
  })

  it('lists the run best efforts this activity set, as grade-adjusted pace', () => {
    renderPage(morningRun)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Best efforts set here' }),
    ).toBeInTheDocument()
    expect(within(statFor('Best 1 min')).getByText('4:07 /km grade-adjusted')).toBeInTheDocument()
    expect(within(statFor('Best 5 min')).getByText('4:31 /km grade-adjusted')).toBeInTheDocument()
    expect(within(statFor('Best 20 min')).getByText('5:00 /km grade-adjusted')).toBeInTheDocument()
    expect(within(statFor('Best 1 h')).getByText('5:37 /km grade-adjusted')).toBeInTheDocument()
  })

  it('lists the ride best efforts this activity set, in watts', () => {
    renderPage(powerRide, resultWith({ rideCurve: rideCurveFixture }))
    expect(within(statFor('Best 1 min')).getByText('1,400 W')).toBeInTheDocument()
    expect(within(statFor('Best 5 min')).getByText('1,230 W')).toBeInTheDocument()
    expect(within(statFor('Best 20 min')).getByText('1,050 W')).toBeInTheDocument()
    // The fixture has no best at one hour, so none is listed.
    expect(screen.queryByText('Best 1 h', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('lists only the durations this activity set', () => {
    renderPage(morningRun, resultWith({ runCurve: curveOf({ 300: 15.6 }) }))
    expect(within(statFor('Best 5 min')).getByText('4:31 /km grade-adjusted')).toBeInTheDocument()
    expect(screen.queryByText('Best 1 min', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Best 20 min', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('says so when this activity set none of the bests in the dated period', () => {
    renderPage(
      makeActivity({ id: 'run-2', name: 'Easy run' }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      DATED,
    )
    expect(
      screen.getByText(
        'None of your best efforts between 12 May and 3 Aug 2025 came from this activity.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/grade-adjusted/)).not.toBeInTheDocument()
  })

  it('lists each data issue with the time range it covers', () => {
    renderPage(
      makeActivity({
        id: 'activity-1',
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
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Data issues' })).toBeInTheDocument()
    expect(
      screen.getByText('Heart rate read zero for over ten seconds (1 min 5 s to 2 min 5 s)'),
    ).toBeInTheDocument()
    expect(screen.getByText('Speed jumped to 40 m/s (5 min to 5 min 1 s)')).toBeInTheDocument()
  })

  it('shows no data issues section when the activity has none', () => {
    renderPage(makeActivity({ id: 'activity-1', name: 'Clean run', flags: [] }))
    expect(screen.queryByRole('heading', { name: 'Data issues' })).not.toBeInTheDocument()
  })

  it('asks for the splits of the run it shows, and shows them in a Splits section', async () => {
    const loadSplits = vi.fn(async () => twoKilometres)
    renderPage(morningRun, resultWith(), 'metric', new Map(), loadSplits)
    expect(loadSplits).toHaveBeenCalledWith('activity-1')
    expect(await screen.findByRole('heading', { level: 2, name: 'Splits' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Pace for each kilometre' })
    const [first, second] = within(table).getAllByRole('row').slice(1)
    expect(within(first!).getByText('5:00 /km')).toBeInTheDocument()
    expect(within(first!).getByText('4:50 /km')).toBeInTheDocument()
    expect(within(second!).getByText('Fastest')).toBeInTheDocument()
  })

  it('says a run whose splits were not kept has none, and shows no table', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => null),
    )
    expect(
      await screen.findByText('Splits were not kept when this run was added.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says the splits could not be loaded when the worker fails to answer', async () => {
    renderPage(
      morningRun,
      resultWith(),
      'metric',
      new Map(),
      vi.fn(async () => Promise.reject(new Error('x'))),
    )
    expect(await screen.findByText(/The splits could not be loaded/)).toBeInTheDocument()
  })

  it('shows no splits section for a ride, and asks for none', () => {
    const loadSplits = vi.fn(async () => twoKilometres)
    renderPage(powerRide, resultWith(), 'metric', new Map(), loadSplits)
    expect(screen.queryByRole('heading', { name: 'Splits' })).not.toBeInTheDocument()
    expect(loadSplits).not.toHaveBeenCalled()
  })
})

describe('ActivityPage records earned', () => {
  const held: ReadonlyMap<string, EarnedRecord[]> = new Map([
    [
      'activity-1',
      [
        { kind: 'duration', durationS: 300 },
        { kind: 'duration', durationS: 3600 },
        { kind: 'distance', distanceM: 5000 },
      ],
    ],
  ])

  it('lists every record the activity holds in one All-time records group', () => {
    renderPage(morningRun, resultWith(), 'metric', held)
    const group = screen.getByRole('group', { name: 'All-time records' })
    expect(within(group).getByText('Best 5 min')).toBeTruthy()
    expect(within(group).getByText('Best 60 min')).toBeTruthy()
    expect(within(group).getByText('Best 5 km')).toBeTruthy()
    expect(within(group).queryByText(/more/)).toBeNull()
  })

  it('shows no Best efforts group for an activity that holds nothing', () => {
    renderPage(morningRun)
    expect(screen.queryByRole('group', { name: 'All-time records' })).toBeNull()
  })
})

describe('route shape', () => {
  const SHAPE = {
    points: [
      [0, 0],
      [1, 1],
    ] as [number, number][],
    aspect: 1,
  }
  const DRAWN = 'Route shape of this run'

  it('draws a route the device library or this tab holds at once, with no offer to read the file', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'shape', route: SHAPE }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    expect(await screen.findByRole('img', { name: DRAWN })).toBeInTheDocument()
    expect(loadRoute).toHaveBeenCalledOnce()
    expect(loadRoute).toHaveBeenCalledWith('saved-1', false)
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('offers to show a route from the kept file, and reads nothing until asked', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'original' }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    const button = await screen.findByRole('button', { name: 'Show route' })
    expect(button).not.toHaveAttribute('aria-disabled', 'true')
    expect(loadRoute).toHaveBeenCalledOnce()
    expect(loadRoute).toHaveBeenCalledWith('saved-1', false)
    expect(screen.queryByRole('img', { name: DRAWN })).toBeNull()
  })

  it('reads the kept file when asked, shows the button as busy meanwhile, then draws the outline', async () => {
    const user = userEvent.setup()
    let finish: (reply: RouteReply) => void = () => undefined
    const loadRoute = vi.fn((_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal
        ? new Promise<RouteReply>((resolve) => {
            finish = resolve
          })
        : Promise.resolve({ kind: 'original' }),
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(loadRoute).toHaveBeenLastCalledWith('saved-1', true)
    expect(screen.getByRole('button', { name: 'Show route' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the route from your original file.',
    )

    await user.click(screen.getByRole('button', { name: 'Show route' }))
    expect(loadRoute).toHaveBeenCalledTimes(2)

    await act(async () => finish({ kind: 'shape', route: SHAPE }))
    expect(await screen.findByRole('img', { name: DRAWN })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('says so neutrally when the file cannot be read, and keeps the button to try again', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'failed' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(
      await screen.findByText('The route could not be read. Try again later.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show route' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('says when the kept file has no route to show, and offers nothing more', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'none' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(await screen.findByText('This file has no route to show.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('asks for no route when the activity is not saved, as with the sample', () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'shape', route: SHAPE }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: null,
      loadRoute,
    })

    expect(loadRoute).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: /Route shape/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
  })

  it('moves focus to the drawn route once a read of the kept file draws it', async () => {
    const user = userEvent.setup()
    let finish: (reply: RouteReply) => void = () => undefined
    const loadRoute = vi.fn((_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal
        ? new Promise<RouteReply>((resolve) => {
            finish = resolve
          })
        : Promise.resolve({ kind: 'original' }),
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    await act(async () => finish({ kind: 'shape', route: SHAPE }))

    const figure = (await screen.findByRole('img', { name: DRAWN })).closest('figure')
    expect(figure).toHaveFocus()
  })

  it('moves focus to the status line when the kept file has no route to show', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'none' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(await screen.findByText('This file has no route to show.')).toHaveFocus()
  })

  it('keeps focus on the button when the read fails, so the visitor can try again', async () => {
    const user = userEvent.setup()
    const loadRoute = vi.fn(async (_id: string, fromOriginal: boolean): Promise<RouteReply> =>
      fromOriginal ? { kind: 'failed' } : { kind: 'original' },
    )
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })
    await user.click(await screen.findByRole('button', { name: 'Show route' }))

    expect(
      await screen.findByText('The route could not be read. Try again later.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show route' })).toHaveFocus()
  })

  it('offers nothing on the first read when the activity has no route in the kept file either', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' }))
    renderPage(makeActivity(), resultWith(), 'metric', undefined, undefined, {
      routeId: 'saved-1',
      loadRoute,
    })

    await waitFor(() => expect(loadRoute).toHaveBeenCalledWith('saved-1', false))
    await act(async () => undefined)

    expect(screen.queryByRole('button', { name: 'Show route' })).toBeNull()
    expect(screen.queryByRole('img', { name: DRAWN })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('the back link to the list', () => {
  afterEach(() => {
    window.history.replaceState(null, '')
    vi.restoreAllMocks()
  })

  it('goes Back when the list was the page before, so the list comes back where it was left', async () => {
    window.history.replaceState({ rcaEntry: 'activity-entry', rcaFrom: '#/activities' }, '')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    renderPage(morningRun)
    await userEvent.click(screen.getByRole('link', { name: 'Back to activities' }))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a command click', { metaKey: true }],
    ['a control click', { ctrlKey: true }],
    ['a shift click', { shiftKey: true }],
    ['an alt click', { altKey: true }],
    ['a middle button click', { button: 1 }],
  ])('leaves %s to the browser, which opens the list as a link does', (_name, modifier) => {
    window.history.replaceState({ rcaEntry: 'activity-entry', rcaFrom: '#/activities' }, '')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    renderPage(morningRun)
    fireEvent.click(screen.getByRole('link', { name: 'Back to activities' }), modifier)
    expect(back).not.toHaveBeenCalled()
  })

  it('links to the list when the visitor came from another page, so the list is a page of its own', async () => {
    window.history.replaceState({ rcaEntry: 'activity-entry', rcaFrom: '#/run' }, '')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    renderPage(morningRun)
    await userEvent.click(screen.getByRole('link', { name: 'Back to activities' }))
    expect(back).not.toHaveBeenCalled()
  })
})

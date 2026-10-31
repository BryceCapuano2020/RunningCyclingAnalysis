// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Sex } from '@rca/core/grade'
import type { PeriodChoice } from '@rca/core/period'
import type { Copy } from '@rca/core/session'
import type { Route } from '../route'
import type { SavedActivity } from '../../worker/protocol'
import type { RouteReply } from '../routeReply'
import { analysisStub, countedRunsStub } from '../../test/analysisStub'
import { curvePoint } from '../charts/fixtures'
import { FIVE_K_IN_20_MIN_WKG, makeActivity, makeResult } from '../components/fixtures'
import { ResultPage } from './ResultPage'
import { PERIOD_KEY } from '../periodPreference'

afterEach(() => {
  cleanup()
})

const SAVED_COPY: Copy = {
  id: 'saved-copy',
  rank: 3,
  hasPower: false,
  hasHeartRate: true,
  durationS: 3600,
}

const PROFILE_PROMPT = 'Add your year of birth and sex'

function renderPage(
  route: Route,
  birthYear: number | null,
  sex: Sex | null,
  weightKnown = true,
  withRide = false,
) {
  const result = makeResult({
    runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    ...(withRide && { rideCurve: [curvePoint(HEADLINE_DURATION_S, 3, 'ride-1')] }),
  })
  return render(
    <ResultPage
      countedRuns={countedRunsStub()}
      signedIn={false}
      route={route}
      analysis={analysisStub()}
      result={result}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      weightKnown={weightKnown}
      units="metric"
      birthYear={birthYear}
      sex={sex}
    />,
  )
}

describe('ResultPage age grades', () => {
  it('grades the run at the age on its date, for the sex on the profile', () => {
    renderPage({ page: 'balance' }, 1986, 'male')

    const run = screen.getByRole('article', { name: 'Run threshold' })
    expect(run).not.toHaveTextContent(/Local|67%/)
    expect(screen.getByRole('region', { name: 'Level in each sport' })).toHaveTextContent(
      /Running\s*67%\s*Local/,
    )
    expect(
      screen.getByText(
        /^Graded for a \d+-year-old man on the USATF road standards\. A level, not a ranking\.$/,
      ),
    ).toBeInTheDocument()
  })

  it('asks once for the year of birth alone when only that is missing', () => {
    renderPage({ page: 'balance' }, null, 'male')

    const prompts = screen.getAllByRole('link', { name: 'Add your year of birth' })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toHaveAttribute('href', '#/profile')
    expect(
      screen.getByText('The balance in points and levels needs your year of birth.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Graded on the/)).not.toBeInTheDocument()
  })

  it('asks for the sex alone when only that is missing', () => {
    renderPage({ page: 'balance' }, 1986, null)

    expect(screen.getByRole('link', { name: 'Add your sex' })).toHaveAttribute('href', '#/profile')
    expect(screen.getByText('The balance in points and levels needs your sex.')).toBeInTheDocument()
  })

  it('asks for both when both are missing', () => {
    renderPage({ page: 'balance' }, null, null)

    expect(screen.getByRole('link', { name: PROFILE_PROMPT })).toHaveAttribute('href', '#/profile')
  })

  it('states on the method page which sex the grades are for, for the same profile', () => {
    renderPage({ page: 'method' }, 1986, 'male')

    expect(screen.getByText('Your grades are for a man.')).toBeInTheDocument()
  })
})

describe('ResultPage sport trend', () => {
  it('starts each sport on the 20-minute trend, so a choice on Run does not carry over to Ride', () => {
    const result = makeResult({
      activities: [makeActivity({ id: 'run-1' }), makeActivity({ id: 'ride-1', sport: 'ride' })],
    })
    const page = (route: Route) => (
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={route}
        analysis={analysisStub()}
        result={result}
        settings={{ massKg: 75, bikeMassKg: 9 }}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />
    )
    const view = render(page({ page: 'run' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Effort length' })).getByRole('radio', {
        name: '5 min',
      }),
    )
    expect(
      within(screen.getByRole('group', { name: 'Effort length' })).getByRole('radio', {
        name: '5 min',
      }),
    ).toBeChecked()

    view.rerender(page({ page: 'ride' }))
    expect(
      within(screen.getByRole('group', { name: 'Effort length' })).getByRole('radio', {
        name: '20 min',
      }),
    ).toBeChecked()
  })
})

describe('ResultPage Ride with no weight entered', () => {
  it('holds the ride figures and asks for the weight, rather than using a placeholder', () => {
    renderPage({ page: 'ride' }, null, null, false)
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
    expect(screen.queryByText('400 W')).not.toBeInTheDocument()
    expect(screen.queryByText(/W\/kg/)).not.toBeInTheDocument()
  })

  it('shows no such prompt on Run, or once a weight is entered', () => {
    renderPage({ page: 'run' }, null, null, false)
    expect(screen.queryByText(/Add your weight on/)).not.toBeInTheDocument()
    cleanup()
    renderPage({ page: 'ride' }, null, null, true)
    expect(screen.queryByText(/Add your weight on/)).not.toBeInTheDocument()
  })
})

describe('ResultPage footnote', () => {
  // A fixed clock: a man born in 1986 is 40 in June 2026.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 10, 12).getTime())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** The ride page with no weight and no year of birth or sex, holding the ride when one is in the library. */
  function renderHeldRide(ride: ReturnType<typeof makeActivity> | null) {
    return render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'ride' }}
        analysis={analysisStub()}
        result={makeResult({ activities: ride ? [ride] : [] })}
        settings={{ massKg: 75, bikeMassKg: 9 }}
        weightKnown={false}
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
  }

  function renderFooter(route: Route, isSample: boolean) {
    return render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={route}
        analysis={analysisStub({ state: { isSample } })}
        result={makeResult({
          runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        })}
        settings={{ massKg: 75, bikeMassKg: 9 }}
        weightKnown={true}
        units="metric"
        birthYear={1986}
        sex="male"
      />,
    )
  }

  it.each([
    ['balance', { page: 'balance' }],
    ['run', { page: 'run' }],
    ['ride', { page: 'ride' }],
  ] as const)('says what the %s page is based on, with a link to Profile', (_name, route) => {
    renderFooter(route, false)
    expect(
      screen.getByText(/Based on 75 kg, man and your age at each effort\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })

  it('drops the Add them link from a held ride’s footnote, since its weight note above links to Profile', () => {
    renderHeldRide(makeActivity({ id: 'ride-1', sport: 'ride' }))
    expect(screen.getByText('Your details are not set yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add them on Profile' })).not.toBeInTheDocument()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
  })

  it('drops the unset line from a run page while its age note asks for the year of birth and sex', () => {
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'run' }}
        analysis={analysisStub()}
        result={makeResult({
          runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        })}
        settings={{ massKg: 75, bikeMassKg: 9 }}
        weightKnown={false}
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    expect(screen.getByRole('link', { name: 'Add your year of birth and sex' })).toBeInTheDocument()
    expect(screen.queryByText('Your details are not set yet.')).not.toBeInTheDocument()
  })

  it('keeps the Add them link on a ride page with no ride to hold, where nothing else links', () => {
    renderHeldRide(null)
    expect(screen.getByRole('link', { name: 'Add them on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })

  it('drops the unset line from Balance while its one prompt for the year of birth and sex is on the page', () => {
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysisStub()}
        result={makeResult()}
        settings={{ massKg: 75, bikeMassKg: 9 }}
        weightKnown={false}
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    expect(screen.getByRole('link', { name: 'Add your year of birth and sex' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByText('Your details are not set yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add them on Profile' })).not.toBeInTheDocument()
  })

  it('leaves the line off the sample, which has its own persona', () => {
    renderFooter({ page: 'run' }, true)
    expect(screen.queryByRole('link', { name: 'Change on Profile' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Based on 75 kg/)).not.toBeInTheDocument()
  })
})

describe('ResultPage How sure is this? with no weight entered', () => {
  it('holds the energy view and asks for the weight, as Balance does, once a ride is on file', () => {
    renderPage({ page: 'method' }, 1986, 'male', false, true)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    expect(screen.getByRole('region', { name: 'The energy view' }).textContent).not.toMatch(
      /90% range/,
    )
  })

  it('shows the energy view once a weight is entered', () => {
    renderPage({ page: 'method' }, 1986, 'male', true)
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })
})

const ACTIVITY = makeActivity({
  id: 'activity-1',
  sport: 'run',
  startMs: Date.UTC(2026, 0, 5, 7, 30),
})
const SETTINGS = { massKg: 70, bikeMassKg: 9 }

function renderActivity(
  savedActivities: SavedActivity[],
  loadRoute: (id: string, fromOriginal: boolean) => Promise<RouteReply>,
) {
  const analysis = analysisStub({
    state: { result: makeResult({ activities: [ACTIVITY] }), library: [ACTIVITY] },
    savedActivities,
    loadRoute,
  })
  return render(
    <ResultPage
      countedRuns={countedRunsStub()}
      signedIn={false}
      route={{ page: 'activity', id: ACTIVITY.id }}
      analysis={analysis}
      result={makeResult({ activities: [ACTIVITY] })}
      settings={SETTINGS}
      units="metric"
      birthYear={null}
      sex={null}
      weightKnown
    />,
  )
}

describe('ResultPage activity route', () => {
  it('asks for the route under the id the activity is saved with', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' }))
    renderActivity(
      [
        {
          id: 'saved-9',
          name: ACTIVITY.name,
          startMs: ACTIVITY.startMs,
          sport: 'run',
          copy: SAVED_COPY,
        },
      ],
      loadRoute,
    )

    await waitFor(() => expect(loadRoute).toHaveBeenCalledWith('saved-9', false))
  })

  it('asks for no route when the activity is not saved, as with the sample', () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' }))
    renderActivity([], loadRoute)

    expect(loadRoute).not.toHaveBeenCalled()
  })

  it('asks for the route of the copy the analysis keeps, when the library holds a GPX and a FIT copy of one workout', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' }))
    const copy = (id: string, rank: number): Copy => ({
      id,
      rank,
      hasPower: false,
      hasHeartRate: true,
      durationS: 3600,
    })
    const saved: SavedActivity[] = [
      {
        id: 'gpx-copy',
        name: ACTIVITY.name,
        startMs: ACTIVITY.startMs,
        sport: 'run',
        copy: copy(`${ACTIVITY.startMs}-morning.gpx`, 1),
      },
      {
        id: 'fit-copy',
        name: ACTIVITY.name,
        startMs: ACTIVITY.startMs,
        sport: 'run',
        copy: copy(`${ACTIVITY.startMs}-morning.fit`, 3),
      },
    ]
    renderActivity(saved, loadRoute)

    await waitFor(() => expect(loadRoute).toHaveBeenCalledWith('fit-copy', false))
    expect(loadRoute).not.toHaveBeenCalledWith('gpx-copy', false)
  })
})

describe('ResultPage activity route, outside the period', () => {
  it('opens an activity the library holds even when the period leaves it out of the analysis', () => {
    const analysis = analysisStub({
      state: { result: makeResult({ activities: [] }), library: [ACTIVITY] },
    })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'activity', id: ACTIVITY.id }}
        analysis={analysis}
        result={makeResult({ activities: [] })}
        settings={SETTINGS}
        units="metric"
        birthYear={null}
        sex={null}
        weightKnown
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: ACTIVITY.name })).toBeInTheDocument()
    expect(screen.queryByText('Activity not found')).not.toBeInTheDocument()
  })
})

describe('ResultPage period', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function renderBalance(setRange: (choice: PeriodChoice) => void) {
    const analysis = analysisStub({
      state: {
        result: makeResult(),
        period: { choice: 'default', startMs: null, endMs: null, days: null, fellBack: false },
      },
      setRange,
    })
    return render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysis}
        result={makeResult()}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
  }

  it('sends the period the athlete picked on this device once there is a result to show it on', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(365))
    const setRange = vi.fn()
    renderBalance(setRange)
    expect(setRange).toHaveBeenCalledWith(365)
  })

  it('sends nothing when the period on screen is already the stored one', () => {
    const setRange = vi.fn()
    renderBalance(setRange)
    expect(setRange).not.toHaveBeenCalled()
  })

  it('keeps All time when the athlete takes it from the answer, as from the control', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(365))
    const setRange = vi.fn()
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const analysis = analysisStub({
      state: {
        result: makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } }),
        library: [ride, run],
        period: {
          choice: 365,
          startMs: new Date(2025, 4, 12, 12).getTime(),
          endMs: new Date(2025, 7, 3, 12).getTime(),
          days: 365,
          fellBack: false,
        },
      },
      setRange,
    })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysis}
        result={makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } })}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show all time' }))
    expect(setRange).toHaveBeenCalledExactlyOnceWith('all', undefined)
    expect(JSON.parse(localStorage.getItem(PERIOD_KEY) ?? 'null')).toBe('all')
  })

  it('stores and sends a period the athlete picks', () => {
    const setRange = vi.fn()
    renderBalance(setRange)
    expect(screen.queryByRole('radio', { name: '3 months' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '12 months' }))
    expect(setRange).toHaveBeenCalledTimes(1)
    expect(setRange).toHaveBeenCalledWith(365, expect.any(Function))
    expect(JSON.parse(localStorage.getItem(PERIOD_KEY) ?? 'null')).toBe(365)
  })

  it('sends one request for one pick, however often the page renders before the period answers', () => {
    const setRange = vi.fn()
    const { rerender } = renderBalance(setRange)
    fireEvent.click(screen.getByRole('radio', { name: '12 months' }))
    expect(setRange).toHaveBeenCalledTimes(1)
    // The analysis still shows the old period: rendering again must not send the pick a second time.
    rerender(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysisStub({
          state: {
            result: makeResult(),
            period: { choice: 'default', startMs: null, endMs: null, days: null, fellBack: false },
          },
          setRange,
        })}
        result={makeResult()}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    expect(setRange).toHaveBeenCalledTimes(1)
  })

  it('sends the stored period again when a load brings the period back to the default', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(365))
    const setRange = vi.fn()
    const page = (choice: PeriodChoice) => (
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysisStub({
          state: {
            result: makeResult(),
            period: { choice, startMs: null, endMs: null, days: null, fellBack: false },
          },
          setRange,
        })}
        result={makeResult()}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />
    )
    const { rerender } = render(page('default'))
    expect(setRange).toHaveBeenCalledTimes(1)
    // The worker answers with the stored period, then a library load resets it.
    rerender(page(365))
    expect(setRange).toHaveBeenCalledTimes(1)
    rerender(page('default'))
    expect(setRange).toHaveBeenCalledTimes(2)
    expect(setRange).toHaveBeenLastCalledWith(365)
  })

  /** A balance page over one run from 3 June 2025, with the clock at 25 October 2026. */
  function renderOldLibrary(fellBack: boolean, withRide = false) {
    const old = makeActivity({
      id: 'old-run',
      sport: 'run',
      startMs: new Date(2025, 5, 3, 7).getTime(),
    })
    const ride = makeActivity({
      id: 'old-ride',
      sport: 'ride',
      startMs: new Date(2025, 0, 2, 7).getTime(),
    })
    const activities = withRide ? [old, ride] : [old]
    const period = {
      choice: 'default' as const,
      startMs: new Date(2025, 4, 12, 12).getTime(),
      endMs: new Date(2025, 7, 3, 12).getTime(),
      days: fellBack ? null : 84,
      fellBack,
    }
    return render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysisStub({
          state: { result: makeResult({ activities }), library: activities, period },
        })}
        result={makeResult({ activities })}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
  }

  it('puts the latest activity, once it is old, in the period control’s note, under the dates', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 25, 12))
    try {
      const { container } = renderOldLibrary(false)
      // Balance's period control is compact: the note is in the line of the dates, after them.
      const caption = container.querySelector('.range-picker__caption')
      const note = container.querySelector('.range-picker__caption .range-picker__inline-note')
      expect(note).toHaveTextContent('Latest activity 17 months ago')
      expect(caption?.textContent).toMatch(/^.+ · Latest activity 17 months ago$/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says why the default is all time, naming the missing sport, and the latest activity, in the same note', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 25, 12))
    try {
      const { container } = renderOldLibrary(true, true)
      expect(container.querySelector('.range-picker__inline-note')).toHaveTextContent(
        'Your last 12 weeks hold no rides, so this shows all time · Same 2 activities as 12 months · Latest activity 17 months ago',
      )
      // The segment in force is All time, not the 12 weeks the stored choice names.
      expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked()
      expect(screen.getByRole('radio', { name: '12 weeks' })).not.toBeChecked()
    } finally {
      vi.useRealTimers()
    }
  })

  it('has no fallback note for a library shorter than 12 weeks, and keeps the latest activity', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 25, 12))
    try {
      const { container } = renderOldLibrary(true)
      // A longer period that holds nothing a shorter one does not says so, in place of repeating itself.
      expect(container.querySelector('.range-picker__inline-note')).toHaveTextContent(
        /^Same 1 activity as 6 weeks · Latest activity 17 months ago$/,
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ResultPage sample athlete', () => {
  it('grades the sample as its own 37-year-old man, without asking the visitor for details', () => {
    const analysis = analysisStub({
      state: {
        result: makeResult({
          runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        }),
        isSample: true,
      },
    })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysis}
        result={makeResult({
          runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        })}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    const run = screen.getByRole('article', { name: 'Run threshold' })
    expect(run).not.toHaveTextContent(/Local/)
    expect(screen.getByRole('region', { name: 'Level in each sport' })).toHaveTextContent(
      /Running\s*\d+%\s*Local/,
    )
    expect(screen.queryByText(PROFILE_PROMPT)).not.toBeInTheDocument()
    expect(screen.queryByText('Sample athlete')).not.toBeInTheDocument()
  })
})

describe('ResultPage round 2: dated periods, the pick note and the sample trend', () => {
  const DATED = {
    choice: 42 as const,
    startMs: new Date(2025, 4, 12, 12).getTime(),
    endMs: new Date(2025, 7, 3, 12).getTime(),
    days: 42,
    fellBack: false,
  }
  const ride = makeActivity({ id: 'ride-1', sport: 'ride' })

  it('dates the period on How sure is this?, in one line with no control', () => {
    const result = makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'method' }}
        analysis={analysisStub({ state: { result, library: [ride], period: DATED } })}
        result={result}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    expect(screen.getByText('Counted over 12 May – 3 Aug 2025.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Period' })).not.toBeInTheDocument()
  })

  it('shows the activity in its dated period without a "none of your bests" line when it set none', () => {
    const analysis = analysisStub({
      state: { result: makeResult({ activities: [ACTIVITY] }), library: [ACTIVITY], period: DATED },
    })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'activity', id: ACTIVITY.id }}
        analysis={analysis}
        result={makeResult({ activities: [ACTIVITY] })}
        settings={SETTINGS}
        units="metric"
        birthYear={null}
        sex={null}
        weightKnown
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: ACTIVITY.name })).toBeInTheDocument()
    expect(screen.queryByText(/None of your best efforts/)).not.toBeInTheDocument()
  })

  it('says a pick waits behind an import, since the page is busy', () => {
    const result = makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysisStub({ state: { result, library: [ride], period: DATED }, busy: true })}
        result={result}
        settings={SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.getByText('Applies when the current import finishes')).toBeInTheDocument()
  })
})

describe('ResultPage activities route, by sign-in state', () => {
  it.each([
    { signedIn: true, from: 'your library' },
    { signedIn: false, from: 'this browser' },
  ])('says a kept activity is removed from $from', ({ signedIn, from }) => {
    const analysis = analysisStub({
      state: { result: makeResult({ activities: [ACTIVITY] }), library: [ACTIVITY] },
      savedActivities: [
        {
          id: 'saved-9',
          name: ACTIVITY.name,
          startMs: ACTIVITY.startMs,
          sport: 'run',
          copy: SAVED_COPY,
        },
      ],
    })
    render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={signedIn}
        route={{ page: 'activities' }}
        analysis={analysis}
        result={makeResult({ activities: [ACTIVITY] })}
        settings={SETTINGS}
        units="metric"
        birthYear={null}
        sex={null}
        weightKnown
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: `Delete ${ACTIVITY.name}` }))
    expect(
      screen.getByText(`Delete “${ACTIVITY.name}”? It is removed from ${from}.`),
    ).toBeInTheDocument()
  })
})

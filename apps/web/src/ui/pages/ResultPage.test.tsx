// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Sex } from '@rca/core/grade'
import type { Copy } from '@rca/core/session'
import type { Route } from '../route'
import type { SavedActivity } from '../../worker/protocol'
import type { RouteReply } from '../routeReply'
import { analysisStub } from '../../test/analysisStub'
import { curvePoint } from '../charts/fixtures'
import { FIVE_K_IN_20_MIN_WKG, makeActivity, makeResult } from '../components/fixtures'
import { ResultPage } from './ResultPage'
import { AnalysisSession } from '@rca/core/session'
import { gradeWeeks } from '../charts/gradeTrend'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
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

const PROFILE_PROMPT = 'Add year of birth and sex'

function renderPage(route: Route, birthYear: number | null, sex: Sex | null, weightKnown = true) {
  const result = makeResult({
    runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
  })
  return render(
    <ResultPage
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

    const run = screen.getByRole('region', { name: 'Run' })
    expect(run.querySelector('.age-grade__line')).toHaveTextContent(
      /^Local · 67% · on your best 20 min/,
    )
    expect(
      screen.getByText(
        /^Graded for a \d+-year-old man on the USATF road standards\. A level, not a ranking\.$/,
      ),
    ).toBeInTheDocument()
  })

  it('asks once for the year of birth and sex when either is missing', () => {
    renderPage({ page: 'balance' }, null, 'male')

    const prompts = screen.getAllByRole('link', { name: PROFILE_PROMPT })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toHaveAttribute('href', '#/profile')
    expect(screen.queryByText(/Graded on the/)).not.toBeInTheDocument()
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

  function renderFooter(route: Route, isSample: boolean) {
    return render(
      <ResultPage
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
    expect(screen.getByText(/Based on 75 kg, age 40, man\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })

  it('leaves the line off the sample, which has its own persona', () => {
    renderFooter({ page: 'run' }, true)
    expect(screen.queryByRole('link', { name: 'Change on Profile' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Based on 75 kg/)).not.toBeInTheDocument()
  })
})

describe('ResultPage How sure is this? with no weight entered', () => {
  it('holds the energy view and asks for the weight, as Balance does', () => {
    renderPage({ page: 'method' }, 1986, 'male', false)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    expect(screen.getByRole('region', { name: 'The energy view' }).textContent).not.toMatch(
      /90% model range/,
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

  function renderBalance(setRange: (choice: number | 'all' | 'default') => void) {
    const analysis = analysisStub({
      state: {
        result: makeResult(),
        period: { choice: 'default', startMs: null, endMs: null, days: null, fellBack: false },
      },
      setRange,
    })
    return render(
      <ResultPage
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
    localStorage.setItem(PERIOD_KEY, JSON.stringify(91))
    const setRange = vi.fn()
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const analysis = analysisStub({
      state: {
        result: makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } }),
        library: [ride, run],
        period: {
          choice: 91,
          startMs: new Date(2025, 4, 12, 12).getTime(),
          endMs: new Date(2025, 7, 3, 12).getTime(),
          days: 91,
          fellBack: false,
        },
      },
      setRange,
    })
    render(
      <ResultPage
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
    expect(setRange).toHaveBeenLastCalledWith('all')
    expect(JSON.parse(localStorage.getItem(PERIOD_KEY) ?? 'null')).toBe('all')
  })

  it('stores and sends a period the athlete picks', () => {
    const setRange = vi.fn()
    renderBalance(setRange)
    fireEvent.click(screen.getByRole('radio', { name: '3 months' }))
    expect(setRange).toHaveBeenCalledWith(91)
    expect(JSON.parse(localStorage.getItem(PERIOD_KEY) ?? 'null')).toBe(91)
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
    const run = screen.getByRole('region', { name: 'Run' })
    expect(run.querySelector('.age-grade__line')).toHaveTextContent(
      /Local · \d+% · on your best 20 min/,
    )
    expect(screen.queryByText(PROFILE_PROMPT)).not.toBeInTheDocument()
    expect(screen.getByText('Sample athlete')).toBeInTheDocument()
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

  it('names the dated period in which the activity set none of the bests', () => {
    const analysis = analysisStub({
      state: { result: makeResult({ activities: [ACTIVITY] }), library: [ACTIVITY], period: DATED },
    })
    render(
      <ResultPage
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
    expect(
      screen.getByText(
        'None of your best efforts between 12 May and 3 Aug 2025 came from this activity.',
      ),
    ).toBeInTheDocument()
  })

  it('says a pick waits behind an import, since the page is busy', () => {
    const result = makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } })
    render(
      <ResultPage
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

  it('shows rides on the age-grade trend for a sample opened by a visitor with no age or sex', () => {
    const sample = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const result = sample.result
    if (result === null) throw new Error('The sample has no result')
    const weeks = gradeWeeks(sample.trend, SAMPLE_PROFILE)
    expect(weeks.some((week) => week.ride !== null)).toBe(true)
    render(
      <ResultPage
        route={{ page: 'balance' }}
        analysis={analysisStub({
          state: { ...sample, library: sample.library, period: sample.period },
        })}
        result={result}
        settings={SAMPLE_SETTINGS}
        weightKnown
        units="metric"
        birthYear={null}
        sex={null}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Best 20 min, week by week' })).toBeInTheDocument()
  })
})

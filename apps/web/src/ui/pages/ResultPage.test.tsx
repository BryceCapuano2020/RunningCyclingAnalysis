// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const PROFILE_PROMPT = 'Add your year of birth and sex on your profile to see age-graded levels.'

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
    expect(within(run).getByText('Estimated age grade 67.6% · Local')).toBeInTheDocument()
    expect(screen.getByText(/Graded on the/)).toHaveTextContent(
      'for a man. Age is counted from your birth year on the date of each effort.',
    )
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
  it('says the ride figures use the placeholder until a weight is entered', () => {
    renderPage({ page: 'ride' }, null, null, false)
    expect(
      screen.getByText(/Ride figures use 75 kg until you add your weight on/),
    ).toBeInTheDocument()
  })

  it('shows no such line on Run, or once a weight is entered', () => {
    renderPage({ page: 'run' }, null, null, false)
    expect(screen.queryByText(/Ride figures use/)).not.toBeInTheDocument()
    cleanup()
    renderPage({ page: 'ride' }, null, null, true)
    expect(screen.queryByText(/Ride figures use/)).not.toBeInTheDocument()
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
    state: { result: makeResult({ activities: [ACTIVITY] }) },
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

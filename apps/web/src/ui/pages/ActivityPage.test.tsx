// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { curveOf, rideCurveFixture, runCurveFixture } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
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

function renderPage(
  activity: ActivitySummary | null,
  result: AnalysisResult = resultWith(),
  units: 'metric' | 'imperial' = 'metric',
) {
  // As in the app, the page's activity is one of the result's activities.
  const activities = activity ? [activity, ...result.activities] : result.activities
  return render(
    <ActivityPage
      activity={activity}
      result={{ ...result, activities }}
      units={units}
      massKg={70}
    />,
  )
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

describe('ActivityPage', () => {
  it('says the activity is not found, and links back to the list, when it is outside the period', () => {
    renderPage(null)
    const heading = screen.getByRole('heading', { level: 1, name: 'Activity not found' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('It may be outside the period you selected.')).toBeInTheDocument()
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
    expect(within(statFor('Best 1 min')).getByText('1400 W')).toBeInTheDocument()
    expect(within(statFor('Best 5 min')).getByText('1230 W')).toBeInTheDocument()
    expect(within(statFor('Best 20 min')).getByText('1050 W')).toBeInTheDocument()
    // The fixture has no best at one hour, so none is listed.
    expect(screen.queryByText('Best 1 h', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('lists only the durations this activity set', () => {
    renderPage(morningRun, resultWith({ runCurve: curveOf({ 300: 15.6 }) }))
    expect(within(statFor('Best 5 min')).getByText('4:31 /km grade-adjusted')).toBeInTheDocument()
    expect(screen.queryByText('Best 1 min', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Best 20 min', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('says so when this activity set none of the library bests', () => {
    renderPage(makeActivity({ id: 'run-2', name: 'Easy run' }))
    expect(
      screen.getByText('None of your best efforts in this period come from this activity.'),
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
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { analysisStub, countedRunsStub } from '../../test/analysisStub'
import { windowLibrary, windowPeriod } from '../../test/windowLibrary'
import { makeActivity, makeResult } from '../components/fixtures'
import type { Route } from '../route'
import { ResultPage } from './ResultPage'

afterEach(() => {
  cleanup()
})

/*
 * One library, counted one way on every page: what is on file, and how many of those the analysis leaves out.
 * Seven on file: five runs and two rides. A walking-pace run, a run labelled Hike and a ride labelled Ski are left
 * out, so four are counted.
 */
const COUNTED_RUNS = [
  makeActivity({ id: 'run-1', sport: 'run' }),
  makeActivity({ id: 'run-2', sport: 'run' }),
  makeActivity({ id: 'run-3', sport: 'run' }),
]
const COUNTED_RIDE = makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' })
const LIBRARY = [
  ...COUNTED_RUNS,
  COUNTED_RIDE,
  makeActivity({ id: 'run-4', sport: 'run', walkingPace: true }),
  makeActivity({ id: 'run-5', sport: 'run', athleteType: 'hike' }),
  makeActivity({ id: 'ride-2', sport: 'ride', athleteType: 'ski' }),
]

function renderPage(route: Route, inPeriod: typeof LIBRARY) {
  const result = makeResult({ activities: inPeriod })
  return render(
    <ResultPage
      countedRuns={countedRunsStub()}
      signedIn={false}
      route={route}
      analysis={analysisStub({
        state: {
          library: LIBRARY,
          result,
          totalActivities: 4,
          walkingPaceRuns: 1,
          labelledRuns: 2,
        },
      })}
      result={result}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      weightKnown
      units="metric"
      birthYear={1986}
      sex="male"
    />,
  )
}

/** A page over the dated library, on a period, which the session holds as it would. */
function renderWindow(route: Route, choice: number | 'all') {
  const library = windowLibrary()
  const counted = library.filter((activity) => activity.walkingPace !== true)
  const period = windowPeriod(choice)
  const inPeriod = counted.filter(
    (activity) =>
      period.startMs === null ||
      (activity.startMs >= period.startMs && activity.startMs <= (period.endMs ?? 0)),
  )
  const result = makeResult({ activities: inPeriod })
  return render(
    <ResultPage
      countedRuns={countedRunsStub()}
      signedIn={false}
      route={route}
      analysis={analysisStub({
        state: {
          library,
          result,
          period,
          totalActivities: counted.length,
          walkingPaceRuns: 1,
        },
      })}
      result={result}
      settings={{ massKg: 75, bikeMassKg: 9 }}
      weightKnown
      units="metric"
      birthYear={1986}
      sex="male"
    />,
  )
}

describe('the count of a period, out of what is on file', () => {
  it('counts what started in the period on file, the activity at walking pace with the rest', () => {
    const { container } = renderWindow({ page: 'balance' }, 42)
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '3 of 8 activities, 1 not counted',
    )
  })

  it('says the same on a sport page, for its own runs', () => {
    const { container } = renderWindow({ page: 'run' }, 42)
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '3 of 5 runs, 1 not counted',
    )
  })

  it('says every activity on file, and how many are not counted, for all time', () => {
    const { container } = renderWindow({ page: 'balance' }, 'all')
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '8 activities, 1 not counted',
    )
  })
})

describe('the count every page gives of the library', () => {
  it('gives Balance the activities on file, with the two numbers linked to where they are', () => {
    const { container } = renderPage({ page: 'balance' }, [COUNTED_RUNS[0]!, COUNTED_RIDE])
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '7 activities, 3 not counted',
    )
    expect(screen.getByRole('link', { name: '7 activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
    expect(screen.getByRole('link', { name: '3 not counted' })).toHaveAttribute(
      'href',
      '#/activities?show=not-counted',
    )
  })

  it('gives a sport page the runs on file, with the runs not counted, linked to the list of them', () => {
    const { container } = renderPage({ page: 'run' }, [COUNTED_RUNS[0]!])
    expect(container.querySelector('.range-picker__count')?.textContent).toBe(
      '5 runs, 2 not counted',
    )
    expect(screen.getByRole('link', { name: '2 not counted' })).toHaveAttribute(
      'href',
      '#/activities?sport=run&show=not-counted',
    )
  })

  it('says nothing is not counted when the analysis reads every activity on file', () => {
    const result = makeResult({ activities: COUNTED_RUNS })
    const { container } = render(
      <ResultPage
        countedRuns={countedRunsStub()}
        signedIn={false}
        route={{ page: 'balance' }}
        analysis={analysisStub({
          state: { library: COUNTED_RUNS, result, totalActivities: 3 },
        })}
        result={result}
        settings={{ massKg: 75, bikeMassKg: 9 }}
        weightKnown
        units="metric"
        birthYear={1986}
        sex="male"
      />,
    )
    expect(container.querySelector('.range-picker__count')).toBeNull()
    expect(screen.queryByText(/not counted/)).not.toBeInTheDocument()
  })
})

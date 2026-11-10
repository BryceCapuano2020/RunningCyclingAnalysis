// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { analysisStub, countedRunsStub } from '../../test/analysisStub'
import { windowLibrary, windowPeriod } from '../../test/windowLibrary'
import { makeActivity, makeResult } from '../components/fixtures'
import type { Route } from '../route'
import { rowValue } from '../test/propertyRows'
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
  it('says the same on a sport page, for its own runs', () => {
    const { container } = renderWindow({ page: 'run' }, 42)
    expect(rowValue(container, 'Runs')).toBe('3 of 5')
    expect(rowValue(container, 'Not counted')).toBe('1')
  })

  it('gives the count once, as the period’s row, beside the last run and distance rows in the one Details', () => {
    const { container } = renderWindow({ page: 'run' }, 42)
    // Two of the three runs in the period are counted by the analysis: the period's row still says three.
    expect(rowValue(container, 'Runs')).toBe('3 of 5')
    expect(rowValue(container, 'Last run')).toMatch(/^\d+ \w+/)
    expect(rowValue(container, 'Distance')).toMatch(/^[\d.]+ km$/)
    const details = container.querySelector('.sport-page__head details')
    expect(details?.querySelector('summary')).toHaveTextContent(/^Details$/)
    expect(details?.querySelectorAll('.props__row').length).toBeGreaterThanOrEqual(4)
  })

  it('says the same on the Ride page, for its own rides', () => {
    const { container } = renderWindow({ page: 'ride' }, 90)
    expect(rowValue(container, 'Rides')).toBe('1 of 3')
    expect(rowValue(container, 'Last ride')).toMatch(/^\d+ \w+/)
  })
})

describe('the count every page gives of the library', () => {
  it('gives a sport page the runs on file, with the runs not counted, linked to the list of them', () => {
    const { container } = renderPage({ page: 'run' }, [COUNTED_RUNS[0]!])
    expect(rowValue(container, 'Runs')).toBe('5')
    expect(rowValue(container, 'Not counted')).toBe('2')
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute(
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

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workoutKey } from '@rca/core/session'
import { analysisStub } from '../../test/analysisStub'
import { makeActivity, makeResult } from '../components/fixtures'
import type { Route } from '../route'
import { WALKING_PACE_CHIP, WALKING_PACE_NOTE } from '../analysis/walkingPaceCopy'
import { ResultPage } from './ResultPage'

afterEach(() => {
  cleanup()
})

/**
 * A library of runs at walking pace alone: the library lists them, and the analysis holds none, so
 * the result has no activities. The pages count and date what the analysis rests on, not them.
 */
const HIKE = makeActivity({
  id: 'hike-1',
  name: 'Saturday hike',
  sport: 'run',
  walkingPace: true,
  startMs: Date.UTC(2020, 5, 6, 8),
})

const KEY = workoutKey('run', HIKE.startMs)

function controller() {
  return {
    keys: [],
    count: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    notKept: null,
    status: '',
  }
}

function renderOnly(route: Route, countedRuns = controller()) {
  const result = makeResult({ activities: [], runCp: null, rideCp: null })
  return render(
    <ResultPage
      signedIn={false}
      countedRuns={countedRuns}
      route={route}
      analysis={analysisStub({
        state: { library: [HIKE], result, totalActivities: 0, walkingPaceRuns: 1 },
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

describe('a library of runs at walking pace alone', () => {
  it('says on Balance that the run is at walking pace and left out, never that there are no runs', () => {
    renderOnly({ page: 'balance' })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your run is at walking pace' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '1 run is at walking pace, so it is left out. Count it as a run to include it.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/no running or cycling/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show all time' })).not.toBeInTheDocument()
    expect(screen.queryByText(/You have 1 run/)).not.toBeInTheDocument()
  })

  it('counts the run from Balance with one press, under its workout key', () => {
    const countedRuns = controller()
    renderOnly({ page: 'balance' }, countedRuns)
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    expect(countedRuns.count).toHaveBeenCalledWith([KEY])
  })

  it('says on Run how many runs are left out and offers to count them, not that the files have none', () => {
    const countedRuns = controller()
    renderOnly({ page: 'run' }, countedRuns)
    expect(
      screen.getByText(
        '1 run is at walking pace, so it is left out. Count it as a run to include it.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/Your files have no runs/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    expect(countedRuns.count).toHaveBeenCalledWith([KEY])
  })

  it('moves focus to the heading once counting has flipped the page, not before', () => {
    const countedRuns = controller()
    const result = makeResult({ activities: [], runCp: null, rideCp: null })
    const props = {
      signedIn: false,
      countedRuns,
      route: { page: 'balance' } as Route,
      result,
      settings: { massKg: 75, bikeMassKg: 9 },
      weightKnown: true,
      units: 'metric' as const,
      birthYear: 1986,
      sex: 'male' as const,
    }
    const left = analysisStub({
      state: { library: [HIKE], result, totalActivities: 0, walkingPaceRuns: 1 },
    })
    const view = render(<ResultPage {...props} analysis={left} />)

    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    // Counted, but the session has not answered yet: the page is as it was, and focus has not been taken.
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()

    // The session answers with the run in the analysis: the headline changes, and focus goes to it.
    const counted = makeActivity({ ...HIKE, walkingPace: undefined })
    const answered = analysisStub({
      state: {
        library: [counted],
        result: makeResult({ activities: [counted], runCp: null, rideCp: null }),
        totalActivities: 1,
        countedWalkingRuns: [KEY],
      },
    })
    view.rerender(<ResultPage {...props} analysis={answered} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('walking pace')
  })

  it('does not take focus at a flip nobody asked for', () => {
    const result = makeResult({ activities: [], runCp: null, rideCp: null })
    const props = {
      signedIn: false,
      countedRuns: controller(),
      route: { page: 'balance' } as Route,
      result,
      settings: { massKg: 75, bikeMassKg: 9 },
      weightKnown: true,
      units: 'metric' as const,
      birthYear: 1986,
      sex: 'male' as const,
    }
    const view = render(
      <ResultPage
        {...props}
        analysis={analysisStub({ state: { library: [HIKE], result, totalActivities: 0 } })}
      />,
    )
    const counted = makeActivity({ ...HIKE, walkingPace: undefined })
    view.rerender(
      <ResultPage
        {...props}
        analysis={analysisStub({ state: { library: [counted], result, totalActivities: 1 } })}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()
  })

  it('offers the choice on the hike’s own page, beside the line that says it is left out', () => {
    const countedRuns = controller()
    renderOnly({ page: 'activity', id: 'hike-1' }, countedRuns)
    fireEvent.click(screen.getByRole('button', { name: 'Count this run' }))
    expect(countedRuns.count).toHaveBeenCalledWith([KEY])
  })

  it('still opens the hike from the list, with its mark and a line in the place of its best efforts', () => {
    renderOnly({ page: 'activity', id: 'hike-1' })
    expect(screen.getByRole('heading', { level: 1, name: 'Saturday hike' })).toBeInTheDocument()
    expect(screen.getByText(WALKING_PACE_CHIP)).toHaveClass('chip')
    expect(screen.getByText(WALKING_PACE_NOTE)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Best efforts/ })).not.toBeInTheDocument()
  })

  it('lists the hike on Activities, marked', () => {
    renderOnly({ page: 'activities' })
    const row = screen.getByRole('link', { name: 'Saturday hike' }).closest('li')!
    expect(within(row).getByText(WALKING_PACE_CHIP)).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

function renderOnly(route: Route) {
  const result = makeResult({ activities: [], runCp: null, rideCp: null })
  return render(
    <ResultPage
      signedIn={false}
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
  it('asks for a run and a ride on Balance, rather than offering the hikes as runs in All time', () => {
    renderOnly({ page: 'balance' })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a run and a ride to see your balance' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show all time' })).not.toBeInTheDocument()
    expect(screen.queryByText(/You have 1 run/)).not.toBeInTheDocument()
  })

  it('says on Run that the files have no runs, not that a run is in All time', () => {
    renderOnly({ page: 'run' })
    expect(
      screen.getByText('Your files have no runs yet. Add runs to see your records.'),
    ).toBeVisible()
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

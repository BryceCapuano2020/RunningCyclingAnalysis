// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { makeActivity, makeResult } from '../components/fixtures'
import { ActivityBests } from './ActivityBests'

afterEach(() => {
  cleanup()
})

/** The activity page's best efforts for one activity, with its own distance time at 10 km. */
function renderBests(activity: ReturnType<typeof makeActivity>, result: AnalysisResult) {
  return render(
    <ActivityBests
      activity={activity}
      result={result}
      units="metric"
      massKg={75}
      weightKnown
      profile={null}
      inPeriod
      earned={[]}
      splitsLoad={{ status: 'loaded', splits: null }}
      splitsView="units"
    />,
  )
}

/** The records list item for one best, found by its label such as "Best 10 km". */
function bestNamed(label: string): HTMLElement {
  const item = screen.getByText(label).closest('li')
  if (item === null) throw new Error(`No best named ${label}`)
  return item
}

describe('the activity page’s Treadmill mark', () => {
  it('marks a distance time set on an indoor run Treadmill', () => {
    const indoor = makeActivity({
      id: 'run-1',
      sport: 'run',
      indoor: true,
      name: 'Dreadmill',
      distanceBests: [{ distanceM: 10000, seconds: 2192 }],
    })
    renderBests(indoor, makeResult({ activities: [indoor] }))

    expect(within(bestNamed('Best 10 km')).getByText('Treadmill')).toBeInTheDocument()
  })

  it('leaves Treadmill off a distance time set outdoors', () => {
    const outdoor = makeActivity({
      id: 'run-1',
      sport: 'run',
      name: 'Morning run',
      distanceBests: [{ distanceM: 10000, seconds: 2192 }],
    })
    renderBests(outdoor, makeResult({ activities: [outdoor] }))

    expect(within(bestNamed('Best 10 km')).queryByText('Treadmill')).toBeNull()
  })
})

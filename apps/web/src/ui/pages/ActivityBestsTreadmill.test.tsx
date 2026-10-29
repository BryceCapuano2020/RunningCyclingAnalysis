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

describe('the activity page of a treadmill run', () => {
  it('shows its distance time without a Best label, mark or grade, under a line saying it is no best', () => {
    const indoor = makeActivity({
      id: 'run-1',
      sport: 'run',
      indoor: true,
      name: 'Dreadmill',
      distanceBests: [{ distanceM: 10000, seconds: 2250 }],
    })
    renderBests(indoor, makeResult({ activities: [indoor] }))

    expect(screen.getByRole('heading', { name: 'Distance times' })).toBeInTheDocument()
    const item = screen.getByText('10 km').closest('li')
    expect(item).not.toBeNull()
    expect(within(item!).getByText('37:30')).toBeInTheDocument()
    expect(within(item!).queryByText(/Flat|Treadmill|record|period/)).toBeNull()
    expect(screen.queryByText('Best 10 km')).toBeNull()
    expect(screen.getByText('Treadmill pace is not used for bests.')).toBeInTheDocument()
  })

  it('says the line alone when it has no distance time', () => {
    const indoor = makeActivity({ id: 'run-1', sport: 'run', indoor: true, name: 'Dreadmill' })
    renderBests(indoor, makeResult({ activities: [indoor] }))

    expect(screen.getByText('Treadmill pace is not used for bests.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Best efforts set here' })).toBeNull()
  })

  it('leaves the line off an outdoor run, whose time is a Best 10 km', () => {
    const outdoor = makeActivity({
      id: 'run-1',
      sport: 'run',
      name: 'Morning run',
      distanceBests: [{ distanceM: 10000, seconds: 2250 }],
    })
    renderBests(outdoor, makeResult({ activities: [outdoor] }))

    expect(within(bestNamed('Best 10 km')).getByText('37:30')).toBeInTheDocument()
    expect(screen.queryByText('Treadmill pace is not used for bests.')).toBeNull()
  })
})

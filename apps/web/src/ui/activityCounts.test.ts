import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import { countsOf, isNotCounted, notCountedHref } from './activityCounts'

const library = [
  makeActivity({ id: 'run-a', sport: 'run' }),
  makeActivity({ id: 'run-b', sport: 'run' }),
  makeActivity({ id: 'run-c', sport: 'run', walkingPace: true }),
  makeActivity({ id: 'run-d', sport: 'run', athleteType: 'hike' }),
  // Both causes: counted once, as the core counts it.
  makeActivity({ id: 'run-e', sport: 'run', athleteType: 'walk', walkingPace: true }),
  makeActivity({ id: 'ride-a', sport: 'ride' }),
  makeActivity({ id: 'ride-b', sport: 'ride', athleteType: 'other' }),
]

describe('countsOf', () => {
  it('counts every activity on file, and how many of them the analysis leaves out', () => {
    expect(countsOf(library)).toEqual({ onFile: 7, notCounted: 4, counted: 3 })
  })

  it('counts one sport on the same rule', () => {
    expect(countsOf(library, 'run')).toEqual({ onFile: 5, notCounted: 3, counted: 2 })
    expect(countsOf(library, 'ride')).toEqual({ onFile: 2, notCounted: 1, counted: 1 })
  })

  it('has nothing left out of a library the analysis reads whole', () => {
    expect(countsOf(library.slice(0, 2))).toEqual({ onFile: 2, notCounted: 0, counted: 2 })
  })

  it('counts an activity the athlete counts as a run, which has neither cause left', () => {
    const counted = makeActivity({ id: 'run-c', sport: 'run', walkingPace: undefined })
    expect(isNotCounted(counted)).toBe(false)
  })
})

describe('notCountedHref', () => {
  it('opens the Activities list on the activities left out, for the whole library or one sport', () => {
    expect(notCountedHref()).toBe('#/activities?show=not-counted')
    expect(notCountedHref('run')).toBe('#/activities?sport=run&show=not-counted')
  })
})

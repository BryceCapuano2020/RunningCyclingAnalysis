import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import type { Period } from '@rca/core/period'
import { windowLibrary, windowPeriod } from '../test/windowLibrary'
import { countsOf, isNotCounted, notCountedHref, startedInPeriod } from './activityCounts'

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
    expect(countsOf(library)).toEqual({ onFile: 7, notCounted: 4 })
  })

  it('counts one sport on the same rule', () => {
    expect(countsOf(library, 'run')).toEqual({ onFile: 5, notCounted: 3 })
    expect(countsOf(library, 'ride')).toEqual({ onFile: 2, notCounted: 1 })
  })

  it('has nothing left out of a library the analysis reads whole', () => {
    expect(countsOf(library.slice(0, 2))).toEqual({ onFile: 2, notCounted: 0 })
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

describe('startedInPeriod', () => {
  const dayLibrary = windowLibrary()
  const ids = (activities: readonly { id: string }[]) => activities.map((activity) => activity.id)

  it('holds every activity on file that started in the window, counted or not', () => {
    expect(ids(startedInPeriod(dayLibrary, windowPeriod(84)))).toEqual([
      'run-1',
      'run-2',
      'run-3',
      'ride-1',
    ])
  })

  it('holds the whole library for all time, and when nothing counted gives the period dates', () => {
    expect(startedInPeriod(dayLibrary, windowPeriod('all'))).toHaveLength(8)
    const undated: Period = {
      choice: 'all',
      startMs: null,
      endMs: null,
      days: null,
      fellBack: false,
    }
    expect(startedInPeriod(dayLibrary.slice(0, 1), undated)).toHaveLength(1)
  })

  it('holds what started in a custom range, and nothing for a range that names no days', () => {
    const range: Period = {
      choice: { from: '2026-04-02', to: '2026-06-30' },
      startMs: Date.UTC(2026, 3, 2),
      endMs: Date.UTC(2026, 5, 30, 23, 59, 59, 999),
      days: 91,
      fellBack: false,
    }
    expect(ids(startedInPeriod(dayLibrary, range))).toEqual(['run-1', 'run-2', 'run-3', 'ride-1'])
    const none: Period = {
      choice: { from: 'soon', to: 'later' },
      startMs: null,
      endMs: null,
      days: null,
      fellBack: false,
    }
    expect(startedInPeriod(dayLibrary, none)).toEqual([])
  })
})

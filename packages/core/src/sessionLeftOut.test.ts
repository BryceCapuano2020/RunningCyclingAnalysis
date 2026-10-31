import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { digestActivity } from './digest'
import { isAnalysed, leftOutCounts } from './digest/analysed'
import { workoutKey } from './duplicates'
import { runReadings } from './fitness/runReadings'
import { AnalysisSession } from './session'
import { sampleSeason } from './synthetic'
import type { ActivityDigest, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const season = sampleSeason().activities.map((activity) => digestActivity(activity))
const runs = season.filter((d) => d.sport === 'run')
const [a, b, c, d, ...rest] = runs
if (a === undefined || b === undefined || c === undefined || d === undefined) {
  throw new Error('The season has fewer than four runs')
}
const keyOf = (digest: ActivityDigest) => workoutKey(digest.sport, digest.startMs)

/** a is labelled, b is at walking pace, c is both, d is neither. */
const mixed: ActivityDigest[] = [
  { ...a, athleteType: 'hike' },
  { ...b, walkingPace: true },
  { ...c, athleteType: 'ski', walkingPace: true },
  d,
  ...rest,
]

describe('isAnalysed', () => {
  it('is false for a label, for a walking pace and for both, and true for neither', () => {
    expect(isAnalysed({})).toBe(true)
    expect(isAnalysed({ athleteType: 'walk' })).toBe(false)
    expect(isAnalysed({ walkingPace: true })).toBe(false)
    expect(isAnalysed({ athleteType: 'other', walkingPace: true })).toBe(false)
  })
})

describe('leftOutCounts', () => {
  it('counts an activity with both causes once, under the label', () => {
    expect(leftOutCounts(mixed)).toEqual({ labelled: 2, walking: 1 })
  })
})

describe('the session’s state', () => {
  it('leaves labelled and walking-pace runs out of the analysis, keeps them listed, and counts each cause once', () => {
    const state = new AnalysisSession().loadDigests(mixed, SETTINGS)
    expect(state.labelledRuns).toBe(2)
    expect(state.walkingPaceRuns).toBe(1)
    expect(state.totalActivities).toBe(mixed.length - 3)
    // The two counts sum to the number left out.
    expect(state.labelledRuns! + state.walkingPaceRuns).toBe(
      state.library.length - state.totalActivities,
    )
    const listed = state.library.filter((x) => x.athleteType !== undefined)
    expect(listed.map((x) => x.id).sort()).toEqual([a.id, c.id].sort())
  })

  it('has no count of labelled runs when there are none, so a library without labels reads as it always did', () => {
    const state = new AnalysisSession().loadDigests(season, SETTINGS)
    expect(Object.hasOwn(state, 'labelledRuns')).toBe(false)
    expect(state.walkingPaceRuns).toBe(0)
  })

  it('counts a left-out run as a run when the athlete says so, whichever the cause', () => {
    const session = new AnalysisSession()
    const counted = session.loadDigests(mixed, {
      ...SETTINGS,
      countedRuns: [keyOf(a), keyOf(b), keyOf(c)],
    })
    expect(counted.totalActivities).toBe(mixed.length)
    expect(counted.labelledRuns).toBeUndefined()
    expect(counted.walkingPaceRuns).toBe(0)
    expect(counted.countedWalkingRuns).toEqual([keyOf(a), keyOf(b), keyOf(c)].sort())
    const some = session.setSettings({ ...SETTINGS, countedRuns: [keyOf(a)] })
    expect(some.totalActivities).toBe(mixed.length - 2)
    expect(some.labelledRuns).toBe(1)
    expect(some.walkingPaceRuns).toBe(1)
  })

  it('does not count a key that names an analysed run', () => {
    const state = new AnalysisSession().loadDigests(mixed, { ...SETTINGS, countedRuns: [keyOf(d)] })
    expect(state.countedWalkingRuns).toEqual([])
  })
})

describe('the fitness unit', () => {
  it('reads a labelled run as it reads one at walking pace: not at all', () => {
    expect(runReadings({ ...d, athleteType: 'hike' }, 'run')).toBeNull()
    expect(runReadings({ ...d, walkingPace: true }, 'run')).toBeNull()
  })
})

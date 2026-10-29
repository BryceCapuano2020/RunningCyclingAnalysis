import { describe, expect, it } from 'vitest'
import { digestActivity } from './digest/digestActivity'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { ActivityDigest } from './types'

const { athlete, activities } = sampleDataset()
const SETTINGS = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))

/** A run from the library that is marked as a walk, as a hike recorded as a run is. */
function hike(): ActivityDigest {
  const source = digests.find((d) => d.sport === 'run' && !d.indoor)!
  const newest = Math.max(...digests.map((d) => d.startMs))
  return {
    ...source,
    id: 'hike',
    name: 'Hike',
    startMs: newest + 3_600_000,
    walkingPace: true,
    // A very fast run curve, so a hike counted as a run would show.
    curve: source.curve.map((point) => Object.assign({}, point, { value: point.value * 2 })),
  }
}

describe('runs at walking pace in a session', () => {
  const walker = hike()

  it('stay in the library, marked, and are counted apart', () => {
    const session = new AnalysisSession()
    const state = session.loadDigests([...digests, walker], SETTINGS)
    const row = state.library.find((a) => a.id === 'hike')
    expect(row?.walkingPace).toBe(true)
    expect(state.walkingPaceRuns).toBe(1)
    expect(state.totalActivities).toBe(digests.length)
  })

  it('are left out of every period’s analysis, which is the library without them', () => {
    const withHike = new AnalysisSession()
    const without = new AnalysisSession()
    withHike.loadDigests([...digests, walker], SETTINGS)
    without.loadDigests([...digests], SETTINGS)
    for (const choice of [14, 42, 365, 'all'] as const) {
      const a = withHike.setRange(choice, SETTINGS)
      const b = without.setRange(choice, SETTINGS)
      expect(a.result?.activities.map((x) => x.id)).not.toContain('hike')
      expect(a.result).toEqual(b.result)
      expect(a.trend).toEqual(b.trend)
      expect(a.heartRateJudgement).toEqual(b.heartRateJudgement)
      expect(a.records.has('hike')).toBe(false)
    }
  })

  it('leave a library of nothing else with a result of no activities, and the hikes in the library', () => {
    const state = new AnalysisSession().loadDigests([walker], SETTINGS)
    expect(state.walkingPaceRuns).toBe(1)
    expect(state.totalActivities).toBe(0)
    expect(state.library.map((a) => a.id)).toEqual(['hike'])
    expect(state.result?.activities).toEqual([])
    expect(state.records.size).toBe(0)
    expect(state.heartRateJudgement.setAside).toEqual([])
  })

  it('count nothing when there are none', () => {
    const state = new AnalysisSession().loadDigests([...digests], SETTINGS)
    expect(state.walkingPaceRuns).toBe(0)
  })
})

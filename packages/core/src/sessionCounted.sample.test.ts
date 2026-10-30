import { describe, expect, it, vi } from 'vitest'
import { dedupeKey } from './duplicates'
import { digestActivity } from './digest/digestActivity'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { ActivityDigest } from './types'

// The sample's full season takes seconds to draw and analyse, and this test is about which settings the
// sample reads, so it is given a season of one walking-pace run.
const hike = vi.hoisted(() => ({ digest: null as ActivityDigest | null }))
vi.mock('./sessionSample', () => ({
  seasonDigests: () => (hike.digest === null ? [] : [hike.digest]),
}))

const { athlete, activities } = sampleDataset()
const source = digestActivity(activities.find((a) => a.sport === 'run' && !a.indoor)!)
hike.digest = { ...source, id: 'hike', walkingPace: true }

describe('counting a run at walking pace, in the sample', () => {
  it('does not apply: the sample is its own athlete and ignores the visitor’s choices', () => {
    const key = dedupeKey('run', source.startMs)
    const state = new AnalysisSession().loadSample({
      massKg: athlete.massKg,
      bikeMassKg: athlete.bikeMassKg,
      countedRuns: [key],
    })

    expect(state.countedWalkingRuns).toEqual([])
    expect(state.walkingPaceRuns).toBe(1)
  })
})

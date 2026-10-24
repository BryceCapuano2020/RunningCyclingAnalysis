import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'

const { athlete, activities } = sampleDataset()
const settings: AthleteSettings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }

describe('activity summaries', () => {
  it('carry a run its distance bests, and a ride none', () => {
    const run = activities.find((a) => a.sport === 'run')!
    const ride = activities.find((a) => a.sport === 'ride')!
    const digests = [digestActivity(run), digestActivity(ride)]
    const { activities: summaries } = combine(digests, settings)
    const runSummary = summaries.find((s) => s.id === run.id)!
    expect(runSummary.distanceBests).toEqual(digests[0]!.distanceBests)
    expect(summaries.find((s) => s.id === ride.id)).not.toHaveProperty('distanceBests')
  })
})

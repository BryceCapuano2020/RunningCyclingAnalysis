import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { summaryOf } from './summary'
import { syntheticActivity as activity } from './test/syntheticActivity'

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

describe('summaryOf: the library list fields', () => {
  it('carries indoor, the moving time, the averages and every flag count', () => {
    const heartRate = new Float64Array(60).fill(150)
    heartRate[30] = 250
    const paused = new Uint8Array(60).fill(1, 0, 10)
    const digest = digestActivity(activity({ id: 'x', n: 60, paused, heartRate, indoor: true }))
    const summary = summaryOf(digest)
    expect(summary.indoor).toBe(true)
    expect(summary.movingS).toBe(50)
    expect(summary.avgHeartRate).toBe(digest.avgHeartRate)
    expect(summary.maxHeartRate).toBe(digest.maxHeartRate)
    expect(summary.flagCounts).toEqual(digest.flagCounts)
    expect(Object.values(summary.flagCounts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })
})

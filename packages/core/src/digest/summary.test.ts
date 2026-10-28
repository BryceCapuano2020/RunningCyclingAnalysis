import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { activitySummaries, combine } from './combine'
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

describe('summaryOf: one summary for each digest', () => {
  it('is the same object each time, so the period and the library list hold the same summaries', () => {
    const digests = activities.slice(0, 6).map((a) => digestActivity(a))
    const summary = summaryOf(digests[0]!)
    expect(summaryOf(digests[0]!)).toBe(summary)
    const period = combine(digests, settings).activities
    const library = activitySummaries(digests)
    expect(period.length).toBe(digests.length)
    for (const entry of period) expect(library).toContain(entry)
  })

  it('reads its digest, not a neighbour of the same activity', () => {
    const digest = digestActivity(activities[0]!)
    const renamed = { ...digest, name: 'Renamed' }
    expect(summaryOf(renamed).name).toBe('Renamed')
    expect(summaryOf(digest).name).toBe(digest.name)
  })
})

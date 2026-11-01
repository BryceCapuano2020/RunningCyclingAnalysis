import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { AnalysisSession } from '../session'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest } from '../types'

const { athlete, activities } = sampleDataset()
const SETTINGS = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))
const run = digests.find((d) => d.sport === 'run' && !d.indoor)!
const newest = Math.max(...digests.map((d) => d.startMs))

type Years = { sports: Record<string, { activities: number }> }[]
const counted = (years: Years): number =>
  years.flatMap((row) => Object.values(row.sports)).reduce((sum, t) => sum + t.activities, 0)

describe('the history in a session', () => {
  it('is the same under every period, because it reads the whole library', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests, SETTINGS)
    const all = session.setRange('all', SETTINGS).history
    for (const choice of [14, 42, 365] as const) {
      expect(session.setRange(choice, SETTINGS).history.years).toBe(all.years)
    }
    expect(counted(all.years)).toBe(digests.length)
  })

  it('leaves out what the analysis leaves out: hidden copies, walking-pace runs and labelled activities', () => {
    // The same workout exported twice, a second apart: one of the two is hidden.
    const copy: ActivityDigest = { ...run, id: 'copy.gpx', startMs: run.startMs + 1000 }
    const hike: ActivityDigest = {
      ...run,
      id: 'hike',
      startMs: newest + 3_600_000,
      walkingPace: true,
    }
    const labelled: ActivityDigest = {
      ...run,
      id: 'labelled',
      startMs: newest + 7_200_000,
      athleteType: 'hike',
    }
    const state = new AnalysisSession().loadDigests([...digests, copy, hike, labelled], SETTINGS)
    expect([state.hiddenDuplicates, state.walkingPaceRuns, state.labelledRuns]).toEqual([1, 1, 1])
    expect(state.totalActivities).toBe(digests.length)
    expect(counted(state.history.years)).toBe(digests.length)
  })

  it('is empty for an empty library', () => {
    expect(new AnalysisSession().loadDigests([], SETTINGS).history.years).toEqual([])
  })
})

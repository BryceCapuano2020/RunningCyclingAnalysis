import { describe, expect, it } from 'vitest'
import { dedupeKey } from './duplicates'
import { digestActivity } from './digest/digestActivity'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { ActivityDigest } from './types'

const { athlete, activities } = sampleDataset()
const SETTINGS = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))

/** A run from the library that is marked as walking pace, as a hike recorded as a run is. */
function hike(): ActivityDigest {
  const source = digests.find((d) => d.sport === 'run' && !d.indoor)!
  const newest = Math.max(...digests.map((d) => d.startMs))
  return { ...source, id: 'hike', name: 'Hike', startMs: newest + 3_600_000, walkingPace: true }
}

const walker = hike()
const KEY = dedupeKey('run', walker.startMs)

describe('counting a run at walking pace as a run', () => {
  it('puts the run in the analysis, unmarked, and out of the walking count', () => {
    const state = new AnalysisSession().loadDigests([...digests, walker], {
      ...SETTINGS,
      countedRuns: [KEY],
    })

    expect(state.walkingPaceRuns).toBe(0)
    expect(state.countedWalkingRuns).toEqual([KEY])
    expect(state.totalActivities).toBe(digests.length + 1)
    expect(state.library.find((a) => a.id === 'hike')?.walkingPace).toBeUndefined()
    expect(state.result?.activities.map((a) => a.id)).toContain('hike')
  })

  it('is the same analysis as the library with that run in it as an ordinary run', () => {
    const ordinary = { ...walker }
    Reflect.deleteProperty(ordinary, 'walkingPace')
    const counted = new AnalysisSession().loadDigests([...digests, walker], {
      ...SETTINGS,
      countedRuns: [KEY],
    })
    const plain = new AnalysisSession().loadDigests([...digests, ordinary], SETTINGS)

    expect(counted.result).toEqual(plain.result)
    expect(counted.trend).toEqual(plain.trend)
    expect(counted.fitness).toEqual(plain.fitness)
  })

  it('changes with the choice, in both directions, on the same session', () => {
    const session = new AnalysisSession()
    session.loadDigests([...digests, walker], SETTINGS)

    const counted = session.setSettings({ ...SETTINGS, countedRuns: [KEY] })
    expect(counted.countedWalkingRuns).toEqual([KEY])

    const back = session.setSettings({ ...SETTINGS, countedRuns: [] })
    expect(back.countedWalkingRuns).toEqual([])
    expect(back.walkingPaceRuns).toBe(1)
    expect(back.library.find((a) => a.id === 'hike')?.walkingPace).toBe(true)
  })

  it('keeps the same analysis object between states while the choice holds', () => {
    const session = new AnalysisSession()
    const settings = { ...SETTINGS, countedRuns: [KEY] }
    const first = session.loadDigests([...digests, walker], settings)
    const second = session.setRange(42, settings)
    const third = session.setRange('default', settings)

    expect(first.library.find((a) => a.id === 'hike')).toBe(
      third.library.find((a) => a.id === 'hike'),
    )
    expect(second.countedWalkingRuns).toEqual([KEY])
  })

  it('lets a library of nothing else but counted hikes be analysed', () => {
    const state = new AnalysisSession().loadDigests([walker], { ...SETTINGS, countedRuns: [KEY] })

    expect(state.totalActivities).toBe(1)
    expect(state.result?.activities.map((a) => a.id)).toEqual(['hike'])
  })

  it('ignores a key that names a run not at walking pace, and one that names nothing held', () => {
    const ordinary = digests.find((d) => d.sport === 'run')!
    const state = new AnalysisSession().loadDigests([...digests, walker], {
      ...SETTINGS,
      countedRuns: [dedupeKey('run', ordinary.startMs), 'run-1'],
    })

    expect(state.countedWalkingRuns).toEqual([])
    expect(state.walkingPaceRuns).toBe(1)
  })

  it('counts a run again after a reload of the same library, as the key is the workout and not the file', () => {
    const session = new AnalysisSession()
    session.loadDigests([...digests, walker], { ...SETTINGS, countedRuns: [KEY] })
    const reloaded = session.loadDigests([...digests, { ...walker, id: 'hike-again' }], {
      ...SETTINGS,
      countedRuns: [KEY],
    })

    expect(reloaded.countedWalkingRuns).toEqual([KEY])
    expect(reloaded.library.find((a) => a.id === 'hike-again')?.walkingPace).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { AnalysisSession } from '../session'
import { sampleDataset } from '../synthetic'

const { athlete, activities } = sampleDataset()
const SETTINGS = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg, birthYear: 1990 }
const digests = activities.map((a) => digestActivity(a))

describe('the bests in a session', () => {
  it('are the whole library’s whatever period is picked, and the same objects each time', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests, SETTINGS)
    const all = session.setRange('all', SETTINGS).history
    expect(all.bests.run.length).toBeGreaterThan(0)
    expect(all.bests.ride.length).toBeGreaterThan(0)
    expect(all.yearCurves.run.years.length).toBeGreaterThan(0)
    for (const choice of [14, 42, 365] as const) {
      const state = session.setRange(choice, SETTINGS).history
      expect(state.bests).toBe(all.bests)
      expect(state.yearCurves).toBe(all.yearCurves)
    }
  })

  it('judge hardness by the library’s own heart-rate reference', () => {
    const state = new AnalysisSession().loadDigests(digests, SETTINGS)
    const hards = [...state.history.bests.run, ...state.history.bests.ride].flatMap((effort) =>
      effort.years.map(([, , hard]) => hard),
    )
    // The sample has heart rate: some efforts are shown hard, and the library's reference is what decides.
    expect(hards.length).toBeGreaterThan(0)
    expect(hards).toContain(true)
  })

  it('are empty for an empty library', () => {
    const { history } = new AnalysisSession().loadDigests([], SETTINGS)
    expect(history.bests).toEqual({ run: [], ride: [] })
    expect(history.yearCurves.run.years).toEqual([])
    expect(history.yearCurves.ride.years).toEqual([])
  })
})

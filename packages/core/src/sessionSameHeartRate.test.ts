import { describe, expect, it } from 'vitest'
import { combine } from './digest/combine'
import { digestActivity } from './digest/digestActivity'
import { sameHeartRate } from './digest/sameHeartRate'
import { AnalysisSession } from './session'
import { DEFAULT_ATHLETE, sampleDataset } from './synthetic'
import type { ActivityDigest, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: 9 }
const digests = (): ActivityDigest[] => sampleDataset().activities.map((a) => digestActivity(a))

describe('the session state: output at the same heart rate', () => {
  it('has the library of the period, and the set-aside of its analysis', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    const state = session.setRange('all', SETTINGS)
    const expected = sameHeartRate(
      digests(),
      new Set(combine(digests(), SETTINGS).heartRateSetAside),
      { referenceHr: { run: state.fitness.run.referenceHr, ride: state.fitness.ride.referenceHr } },
    )
    expect(state.sameHeartRate).toEqual(expected)
  })

  it('is read at the heart rate the fitness card names, under every period, for both sports', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    for (const choice of ['all', 42] as const) {
      const state = session.setRange(choice, SETTINGS)
      for (const sport of ['run', 'ride'] as const) {
        expect(state.fitness[sport].referenceHr).not.toBeNull()
        expect(state.sameHeartRate[sport].referenceHeartRate).toBe(state.fitness[sport].referenceHr)
        expect(state.lookBack.sports[sport].referenceHr).toBe(state.fitness[sport].referenceHr)
      }
    }
  })

  it('is not worked out again when only the body mass changes', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    const first = session.setRange('all', SETTINGS)
    const second = session.setSettings({ ...SETTINGS, massKg: SETTINGS.massKg + 10 })
    expect(second.sameHeartRate).toBe(first.sameHeartRate)
  })

  it('has nothing for an empty library', () => {
    const state = new AnalysisSession().setSettings(SETTINGS)
    expect(state.sameHeartRate.run.weeks).toEqual([])
    expect(state.sameHeartRate.ride.referenceHeartRate).toBeNull()
  })

  it('keeps the library’s reference heart rate when another period is picked', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    const all = session.setRange('all', SETTINGS).sameHeartRate.ride.referenceHeartRate
    expect(all).not.toBeNull()
    expect(session.setRange(42, SETTINGS).sameHeartRate.ride.referenceHeartRate).toBe(all)
  })

  it('is not worked out again when a period already shown is picked again', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    const first = session.setRange(42, SETTINGS)
    session.setRange('all', SETTINGS)
    expect(session.setRange(42, SETTINGS).sameHeartRate).toBe(first.sameHeartRate)
  })
})

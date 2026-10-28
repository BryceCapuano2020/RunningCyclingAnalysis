import { describe, expect, it } from 'vitest'
import { combine } from './digest/combine'
import { digestActivity } from './digest/digestActivity'
import { lateEvidence } from './digest/lateEvidence'
import { AnalysisSession } from './session'
import { DEFAULT_ATHLETE, sampleDataset } from './synthetic'
import type { ActivityDigest, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: 9 }
const digests = (): ActivityDigest[] => sampleDataset().activities.map((a) => digestActivity(a))

describe('the session state: late-effort evidence', () => {
  it('is the evidence of the period’s digests, with the set-aside of its analysis', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    const state = session.setRange('all', SETTINGS)
    const expected = lateEvidence(
      digests(),
      new Set(combine(digests(), SETTINGS).heartRateSetAside),
    )
    expect(state.lateEvidence).toEqual(expected)
  })

  it('is not worked out again when only the body mass changes', () => {
    const session = new AnalysisSession()
    session.loadDigests(digests(), SETTINGS)
    const first = session.setRange('all', SETTINGS)
    const second = session.setSettings({ ...SETTINGS, massKg: SETTINGS.massKg + 10 })
    expect(second.lateEvidence).toBe(first.lateEvidence)
  })

  it('has nothing for an empty library', () => {
    const state = new AnalysisSession().setSettings(SETTINGS)
    expect(state.lateEvidence.run.drift).toEqual([])
    expect(state.lateEvidence.ride.durability).toEqual([])
  })
})

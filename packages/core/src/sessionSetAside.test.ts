import { describe, expect, it, vi } from 'vitest'
import { combine } from './digest/combine'
import * as setAsideModule from './digest/setAside'
import { AnalysisSession } from './session'
import { SET_ASIDE_SETTINGS as SETTINGS, setAsideLibrary } from './zones/test/setAsideLibrary'

vi.mock('./digest/setAside', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/setAside')>()
  return { ...actual, judgeHeartRate: vi.fn(actual.judgeHeartRate) }
})

const judged = vi.mocked(setAsideModule.judgeHeartRate)

describe('whose heart rate is set aside', () => {
  const { digests } = setAsideLibrary()
  const library = combine(digests, SETTINGS)

  it('is a judgement of the library, where a period judged alone would judge differently', () => {
    // The fixture's point: the recent period has no calibrated ride, so its own bike model is the default
    // one, and judged alone it sets the borderline ride aside; the library does not.
    const recent = digests.filter((digest) => digest.calibration === null)
    expect(recent.length).toBeGreaterThan(5)
    expect(combine(recent, SETTINGS).heartRateSetAside).toContain('borderline')
    expect(library.heartRateSetAside).not.toContain('borderline')
    expect(library.heartRateSetAside.length).toBeGreaterThan(0)
  })

  it('is the same list for every period, and the all-time analysis’s own', () => {
    const session = new AnalysisSession()
    session.loadDigests([...digests], SETTINGS)
    const all = session.setRange('all', SETTINGS)
    expect(all.heartRateJudgement.setAside).toEqual(library.heartRateSetAside)
    expect(all.result?.heartRateSetAside).toEqual(library.heartRateSetAside)
    for (const choice of [14, 42, 84, 365, 'default'] as const) {
      const state = session.setRange(choice, SETTINGS)
      const inPeriod = new Set(state.result?.activities.map((activity) => activity.id))
      expect(state.heartRateJudgement.setAside).toEqual(library.heartRateSetAside)
      // The period's analysis names the library's set-aside among its own activities, and no other.
      expect(state.result?.heartRateSetAside).toEqual(
        library.heartRateSetAside.filter((id) => inPeriod.has(id)),
      )
      expect(state.result?.heartRateSetAside).not.toContain('borderline')
      // What the period would have said alone, so this test fails if the period judges for itself.
      if (choice === 42) {
        const alone = combine(
          digests.filter((digest) => inPeriod.has(digest.id)),
          SETTINGS,
        )
        expect(alone.heartRateSetAside).toContain('borderline')
      }
    }
  })

  it('says what the library was judged against, which is not always the period’s own figure', () => {
    const session = new AnalysisSession()
    session.loadDigests([...digests], SETTINGS)
    const state = session.setRange(42, SETTINGS)
    const { referenceHr, threshold } = state.heartRateJudgement
    expect(referenceHr).toEqual({ run: library.runMaxHeartRate, ride: library.rideMaxHeartRate })
    expect(threshold.run).toBeGreaterThan(0)
    expect(threshold.ride).toBeGreaterThan(0)
  })

  it('is not judged again when the period changes', () => {
    const session = new AnalysisSession()
    session.loadDigests([...digests], SETTINGS)
    judged.mockClear()
    for (const choice of [14, 42, 84, 'all', 14, 42] as const) session.setRange(choice, SETTINGS)
    expect(judged).not.toHaveBeenCalled()
    // A change of weight is a different judgement.
    session.setSettings({ ...SETTINGS, massKg: SETTINGS.massKg + 5 })
    expect(judged).toHaveBeenCalledTimes(1)
  })

  it('leaves a set-aside ride out of the zones, in the period and the one before', () => {
    const session = new AnalysisSession()
    const state = session.loadDigests([...digests], SETTINGS)
    expect(state.heartRateJudgement.setAside).toContain('sample-09')
    const all = session.setRange('all', SETTINGS)
    const heartRate = all.timeInZones.current.ride.find((row) => row.measure === 'heartRate')!
    expect(heartRate.setAside).toBe(1)
  })
})

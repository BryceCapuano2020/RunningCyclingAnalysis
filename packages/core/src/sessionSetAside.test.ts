import { describe, expect, it, vi } from 'vitest'
import { combine } from './digest/combine'
import * as setAsideModule from './digest/setAside'
import { AnalysisSession } from './session'
import { SET_ASIDE_SETTINGS as SETTINGS, setAsideLibrary } from './zones/test/setAsideLibrary'

vi.mock('./digest/setAside', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/setAside')>()
  return { ...actual, heartRateSetAsideOf: vi.fn(actual.heartRateSetAsideOf) }
})

const judged = vi.mocked(setAsideModule.heartRateSetAsideOf)

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
    expect(all.timeInZones.heartRateSetAside).toEqual(library.heartRateSetAside)
    expect(all.result?.heartRateSetAside).toEqual(library.heartRateSetAside)
    for (const choice of [14, 42, 84, 365, 'default'] as const) {
      const state = session.setRange(choice, SETTINGS)
      const inPeriod = new Set(state.result?.activities.map((activity) => activity.id))
      expect(state.timeInZones.heartRateSetAside).toEqual(library.heartRateSetAside)
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

  it('reads the same list in the heart-rate charts, the late evidence and the zones', () => {
    const session = new AnalysisSession()
    const state = session.loadDigests([...digests], SETTINGS)
    expect(state.timeInZones.heartRateSetAside.length).toBeGreaterThan(0)
    const rows = state.timeInZones.current.ride.find((row) => row.measure === 'heartRate')!
    expect(rows.setAside).toBeLessThanOrEqual(state.timeInZones.heartRateSetAside.length)
  })
})

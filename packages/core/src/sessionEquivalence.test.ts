import { describe, expect, it } from 'vitest'
import { combine } from './digest/combine'
import { digestActivity } from './digest/digestActivity'
import { equivalenceFor } from './digest/combine'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'

const { athlete, activities } = sampleDataset()
const SETTINGS = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))
const PERIODS = [14, 42, 84, 365, 'all'] as const

/**
 * What one ride is worth on foot is a fact about that effort and the athlete, not about the window the
 * page looks through. The heart-rate calibration that narrows the efficiency draws is the athlete's, taken
 * over the library, so no period moves it.
 */
describe('the run pace of a ride across periods', () => {
  const session = new AnalysisSession()
  session.loadDigests([...digests], SETTINGS)
  const states = PERIODS.map((choice) => ({ choice, state: session.setRange(choice, SETTINGS) }))

  it('prices every equivalent with the library calibration, whichever period is shown', () => {
    const library = states.at(-1)!.state.heartRateJudgement.calibration
    expect(library?.kappa).toBeGreaterThan(0)
    const worth = equivalenceFor(library)
    let checked = 0
    for (const { state } of states) {
      expect(state.heartRateJudgement.calibration).toEqual(library)
      for (const e of state.result?.equivalents ?? []) {
        expect(e.runSpeed).toEqual(worth(e.ridePowerW, SETTINGS.massKg))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('gives the same ride the same pace where two periods share it', () => {
    const byWatts = new Map<string, number[]>()
    for (const { state } of states) {
      for (const e of state.result?.equivalents ?? []) {
        const key = `${e.durationS}|${e.ridePowerW}`
        byWatts.set(key, [...(byWatts.get(key) ?? []), e.runSpeed.p50])
      }
    }
    const shared = [...byWatts.values()].filter((speeds) => speeds.length > 1)
    expect(shared.length).toBeGreaterThan(5)
    for (const speeds of shared) expect(new Set(speeds).size).toBe(1)
  })

  it('moves where a period alone would calibrate differently, which is what the library calibration removes', () => {
    const state = states.find(({ choice }) => choice === 42)!.state
    const period = new Set(state.result?.activities.map((a) => a.id))
    const alone = combine(
      digests.filter((d) => period.has(d.id)),
      SETTINGS,
    )
    expect(alone.hr.kappa).not.toBe(state.heartRateJudgement.calibration?.kappa)
    expect(alone.equivalents.map((e) => e.runSpeed.p50)).not.toEqual(
      state.result?.equivalents.map((e) => e.runSpeed.p50),
    )
  })
})

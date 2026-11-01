import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '../session'

describe('the judgement of a library that reaches hard heart rates', () => {
  it('holds the hard sessions of the whole library, which the all-time analysis reports as its own', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const state = session.loadSample({ massKg: 75, bikeMassKg: 9 })
    const { sessions, floor } = state.heartRateJudgement
    for (const sport of ['run', 'ride'] as const) {
      expect(sessions[sport].hard.length).toBeGreaterThan(0)
      expect(sessions[sport]).toEqual(state.result!.effortGate[sport].sessions)
      expect(floor[sport]?.durationS).toBe(state.result!.effortGate[sport].floor?.durationS)
    }
  })
})

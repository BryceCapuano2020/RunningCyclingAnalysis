import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '../session'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }

describe('the sample athlete’s run page', () => {
  const state = new AnalysisSession().loadSample(SETTINGS)
  const calls = state.change?.run ?? []

  it('reads no clear change at 20 minutes, with the efforts of both periods read as they stand', () => {
    expect(calls.length).toBeGreaterThan(0)
    const twenty = calls.find((one) => one.durationS === 1200)!
    expect(twenty.verdict).toBe('none')
    // Its earlier weeks hold too few hard runs with a heart rate for the hard ones to be compared, so every run of both periods
    // is read, and the call says the effort was not checked (the strip's line).
    expect(twenty.gated).toBe(false)
  })
})

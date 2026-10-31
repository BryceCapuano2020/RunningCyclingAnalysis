import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '../session'
import { CHANGE } from './constants'
import { detectableAt, MAX_STATED_RESOLUTION, statedResolutionAt } from './types'
import type { ChangeCall } from './types'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }

const call = (strong: number, record: number): ChangeCall => ({
  durationS: 1200,
  now: 12,
  before: 12,
  basis: 'all',
  observed: 0,
  low: -record,
  high: record,
  strongLow: -strong,
  strongHigh: strong,
  verdict: 'none',
})

describe('the smallest change a sentence may state', () => {
  it('is the band’s wider side as a fraction, up to a quarter, and nothing beyond it', () => {
    expect(statedResolutionAt(call(0.07, 0.04), 'headline')).toBeCloseTo(Math.expm1(0.07), 6)
    expect(statedResolutionAt(call(0.2, 0.04), 'headline')).toBeCloseTo(Math.expm1(0.2), 6)
    expect(statedResolutionAt(call(0.6, 0.3), 'headline')).toBeNull()
    expect(detectableAt(call(0.6, 0.3), 'headline')!).toBeGreaterThan(0.8)
    expect(statedResolutionAt(call(0.6, 0.2), 'record')).toBeCloseTo(Math.expm1(0.2), 6)
  })
})

describe('the sample athlete’s run page', () => {
  const state = new AnalysisSession().loadSample(SETTINGS)
  const calls = state.change?.run ?? []

  it('never states a smallest change over the cap, at either level', () => {
    expect(calls.length).toBeGreaterThan(0)
    for (const one of calls) {
      for (const level of ['record', 'headline'] as const) {
        const stated = statedResolutionAt(one, level)
        if (stated !== null) expect(stated).toBeLessThanOrEqual(MAX_STATED_RESOLUTION)
      }
    }
  })

  it('tests the sample’s run and ride at 20 minutes: both periods hold hard efforts, which are the readings', () => {
    // The landing demo must not read "not enough to compare". Most of the last 12 weeks' runs and rides are easy and not readings;
    // the hard ones (tempo, intervals, tests, the race) are. The weeks before hold hard sessions recorded without a strap, which
    // the gate cannot judge and so counts. Each side has the 4 and the pooled 12 the test needs.
    for (const sport of ['run', 'ride'] as const) {
      const twenty = state.change![sport].find((one) => one.durationS === 1200)!
      expect(twenty.now).toBeGreaterThanOrEqual(CHANGE.minPerSide)
      expect(twenty.before).toBeGreaterThanOrEqual(CHANGE.minPerSide)
      expect(twenty.now + twenty.before).toBeGreaterThanOrEqual(CHANGE.minPooled)
      expect(twenty.verdict).not.toBe('untested')
    }
  })
})

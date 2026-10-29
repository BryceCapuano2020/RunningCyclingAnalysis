import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { SAMPLE_SETTINGS } from './sampleAthlete'
import { thresholdRange, thresholdSpan } from './thresholdRange'
import { makeResult } from './components/fixtures'

const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
const result = state.result!

describe('thresholdSpan', () => {
  it('has the range the page states, and no other: a span exactly where thresholdRange has a line', () => {
    for (const sport of ['run', 'ride'] as const) {
      const line = thresholdRange(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      const span = thresholdSpan(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      expect(span === null).toBe(line === null)
    }
  })

  it('prints the two ends the line prints, in the order it prints them', () => {
    const line = thresholdRange(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')
    const span = thresholdSpan(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')
    expect(line).not.toBeNull()
    expect(line).toMatch(
      new RegExp(`^(?:Fit spread|Range) ${span?.ends[0].text} to ${span?.ends[1].text} `),
    )
  })

  it('reads a running range from its faster end, which is the higher critical power', () => {
    const span = thresholdSpan(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')
    expect(span?.ends[0].cp).toBeGreaterThan(span?.ends[1].cp ?? Infinity)
    expect(span?.centreCp).toBeLessThan(span?.ends[0].cp ?? 0)
    expect(span?.centreCp).toBeGreaterThan(span?.ends[1].cp ?? Infinity)
  })

  it('is null without a fit', () => {
    expect(thresholdSpan(makeResult({ runCp: null }), 'run', 75, 'metric')).toBeNull()
  })
})

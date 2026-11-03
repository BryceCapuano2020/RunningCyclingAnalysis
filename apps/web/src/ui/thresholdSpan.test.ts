import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { SAMPLE_SETTINGS } from './sampleAthlete'
import { runBandShare, thresholdRange, thresholdSpan } from './thresholdRange'
import { makeResult } from './components/fixtures'

const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
const result = state.result!

describe('thresholdSpan', () => {
  it('has the range the page states, and no other: a run’s span exactly where thresholdRange has a line', () => {
    const mass = SAMPLE_SETTINGS.massKg
    expect(thresholdRange(result, 'run', mass, 'metric')).not.toBeNull()
    for (const run of [result, makeResult({ runCp: null })]) {
      const line = thresholdRange(run, 'run', mass, 'metric')
      const span = thresholdSpan(run, 'run', mass, 'metric')
      expect(span === null).toBe(line === null)
    }
  })

  it('draws no track for a ride, whose range is said in words one tap down', () => {
    expect(result.rideThreshold).not.toBeNull()
    expect(thresholdRange(result, 'ride', SAMPLE_SETTINGS.massKg, 'metric')).toMatch(/^Range /)
    expect(thresholdSpan(result, 'ride', SAMPLE_SETTINGS.massKg, 'metric')).toBeNull()
  })

  it('prints the two ends the line prints, in the order it prints them', () => {
    const line = thresholdRange(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')
    const span = thresholdSpan(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')
    expect(line).not.toBeNull()
    expect(line).toMatch(new RegExp(`^Range ${span?.ends[0].text} to ${span?.ends[1].text} `))
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

describe('the band’s allowance', () => {
  const fit = { cp: 4.0, wPrime: 20, cpSe: 0.05, r2: 0.99, nPoints: 6 }
  const gate = (over: Partial<ReturnType<typeof makeResult>['effortGate']['run']>) => ({
    ...makeResult().effortGate.run,
    ...over,
  })

  it('takes the share of a gate that judged the effort hard, and the hard line’s allowance from any other', () => {
    const hard = makeResult({
      runCp: fit,
      effortGate: { ...makeResult().effortGate, run: gate({ verdict: 'hard', share: 0.99 }) },
    })
    expect(runBandShare(hard)).toBe(0.99)
    // A gate that could not judge has worked out a share only by chance, with no heart rate on the best or a thin reference.
    for (const unchecked of ['noHeartRate', 'thin'] as const) {
      const unknown = makeResult({
        runCp: fit,
        effortGate: {
          ...makeResult().effortGate,
          run: gate({ verdict: 'unknown', unchecked, share: 0.99 }),
        },
      })
      expect(runBandShare(unknown)).toBeNull()
    }
  })

  it('draws a wider top end for an unchecked effort than for one that reached the reference', () => {
    const at = (verdict: 'hard' | 'unknown') =>
      thresholdSpan(
        makeResult({
          runCp: fit,
          effortGate: {
            ...makeResult().effortGate,
            run: gate({ verdict, share: 0.99, unchecked: verdict === 'hard' ? null : 'thin' }),
          },
        }),
        'run',
        70,
        'metric',
      )!
    // A run's span reads from its faster end: the first end is the higher critical power.
    expect(at('unknown').ends[0].cp).toBeGreaterThan(at('hard').ends[0].cp)
  })
})

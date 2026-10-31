import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest'
import { AnalysisSession } from '../session'
import { SAMPLE_CLOCK, SAMPLE_SEEDS, generateSampleActivity, samplePlan } from './sampleSeason'

/**
 * The seeds the sample may use (SAMPLE_SEEDS), each replayed through the shipped analysis: the planted easy slip is
 * found with a range clear of zero, and the ride's fitness card says it has too few steady rides from before the
 * last 8 weeks. The effort gate (D1) also passes on each, with a margin: checked there, in its own sample test.
 */
describe('the seeds the sample may use', () => {
  it.each(SAMPLE_SEEDS)('seed %i tells the whole story', (seed) => {
    const digests = samplePlan(SAMPLE_CLOCK, seed).map((entry) =>
      digestActivity(generateSampleActivity(entry)),
    )
    const session = new AnalysisSession()
    // Today for the status is the day the sample is loaded on, as loadSample sets it.
    session.clock = () => SAMPLE_CLOCK.nowMs
    const { fitness, result } = session.loadDigests(digests, { massKg: 75, bikeMassKg: 9 })
    expect(result!.runCp).not.toBeNull()
    expect(result!.rideCp).not.toBeNull()
    expect(result!.runVo2max).not.toBeNull()
    expect(fitness.run.state).toBe('slipping')
    expect(fitness.run.change!.high).toBeLessThan(0)
    expect(fitness.ride.state).toBe('not-enough-evidence')
    expect(fitness.ride.shortfall?.kind).toBe('history')
  })
})

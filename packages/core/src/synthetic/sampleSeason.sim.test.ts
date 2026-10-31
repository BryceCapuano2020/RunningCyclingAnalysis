import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest'
import { AnalysisSession } from '../session'
import { SAMPLE_CLOCK, SAMPLE_SEEDS, generateSampleActivity, samplePlan } from './sampleSeason'

/**
 * The seeds the sample may use (SAMPLE_SEEDS), each replayed through the shipped analysis: the planted easy slip is
 * found with a range clear of zero, the ride's fitness card says it has too few steady rides from before the
 * last 8 weeks, and the change test can judge the run's 20 minute best. The effort gate (D1) also passes on each, with a margin: checked there, in its own sample test.
 */
describe('the seeds the sample may use', () => {
  it.each(SAMPLE_SEEDS)('seed %i tells the whole story', (seed) => {
    const digests = samplePlan(SAMPLE_CLOCK, seed).map((entry) =>
      digestActivity(generateSampleActivity(entry)),
    )
    const session = new AnalysisSession()
    // Today for the status is the day the sample is loaded on, as loadSample sets it.
    session.clock = () => SAMPLE_CLOCK.nowMs
    const { fitness, result, change } = session.loadDigests(digests, { massKg: 75, bikeMassKg: 9 })
    expect(result!.runCp).not.toBeNull()
    expect(result!.rideCp).not.toBeNull()
    expect(result!.runVo2max).not.toBeNull()
    expect(fitness.run.state).toBe('slipping')
    expect(fitness.run.change!.high).toBeLessThan(0)
    expect(fitness.ride.state).toBe('not-enough-evidence')
    expect(fitness.ride.shortfall?.kind).toBe('history')
    // The run's 20 minute best is tested against the period before (every effort of both, which the call says: the earlier weeks
    // hold too few hard runs with a heart rate). The ride started this autumn, so its comparison is left to the change test.
    expect(change?.run.find((call) => call.durationS === 1200)?.verdict).not.toBe('untested')
  })
})

import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { headlineGrades } from './grades'
import { levelTargetText } from './levelTarget'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'

/**
 * The line is worked out in the Balance page's render, so it must not hold the main thread. Its
 * ride-as-lower-sport search runs a bisection on the ride's equivalence, and this budget keeps that
 * search cheap enough for a render.
 */
const BUDGET_MS = 40

/** The fastest of three timed calls, ms, so neither the cold first call nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('levelTargetText performance', () => {
  it(`names a ride's level target on the sample, with the ride as the lower sport, in under ${BUDGET_MS} ms`, () => {
    const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const { result } = state
    if (result === null) throw new Error('The sample has no result')
    const sampleGrades = headlineGrades(result, SAMPLE_PROFILE)
    const run = sampleGrades.run
    if (run.kind !== 'graded') throw new Error('The sample has no run grade')
    // The sample's ride is the higher sport, so the run is given a higher grade: the ride is then the one to level.
    const grades = {
      ...sampleGrades,
      run: { ...run, grade: { ...run.grade, centre: { grade: 0.85, level: 'National' as const } } },
    }
    let line: string | null = null
    const ms = fastestMs(() => {
      line = levelTargetText({
        lean: 'run',
        grades,
        result,
        sex: SAMPLE_PROFILE.sex,
        massKg: SAMPLE_SETTINGS.massKg,
        units: 'metric',
        calibration: state.heartRateJudgement.calibration,
      })
    })
    // Keeping the line means none of the timed work can be skipped.
    expect(line).toContain('would need about')
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})

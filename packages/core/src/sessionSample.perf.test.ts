import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import { SAMPLE_REFERENCE_NOW_MS, generateSampleActivity, samplePlan } from './synthetic'
import { fastestMs } from './test/timing'

/**
 * What "See a sample athlete" costs: the season is drawn second by second and digested in the worker
 * before the first result shows. Locally the whole load takes about 0.5 s, planning alone under 5 ms.
 * The budget is about four times that, so a season that grows by a few dozen long sessions, or a plan
 * that starts to generate samples, fails it on a loaded runner too.
 */
const LOAD_BUDGET_MS = 2000
const PLAN_BUDGET_MS = 50
/** A clock with a zone of its own, as the app's is, so each load draws the season rather than reuse one. */
const APP_CLOCK = { nowMs: SAMPLE_REFERENCE_NOW_MS, utcOffsetMinutes: () => 0 }

describe('the sample athlete’s load time', () => {
  it(`draws, digests and analyses the season in under ${LOAD_BUDGET_MS} ms`, () => {
    let loaded = 0
    const ms = fastestMs(() => {
      loaded = new AnalysisSession().loadSample(
        { massKg: 75, bikeMassKg: 9 },
        APP_CLOCK,
      ).totalActivities
    }, 3)
    expect(loaded).toBe(samplePlan().length)
    expect(ms).toBeLessThan(LOAD_BUDGET_MS)
  })

  it(`plans the season without drawing any of it, in under ${PLAN_BUDGET_MS} ms`, () => {
    let planned = 0
    const ms = fastestMs(() => {
      planned = samplePlan().length
    }, 5)
    expect(planned).toBeGreaterThan(100)
    expect(ms).toBeLessThan(PLAN_BUDGET_MS)
  })

  it('draws one recording on demand, much faster than the whole season', () => {
    const entry = samplePlan().find((candidate) => candidate.spec.name === 'Sunday Long Run')!
    const ms = fastestMs(() => generateSampleActivity(entry), 3)
    expect(ms).toBeLessThan(LOAD_BUDGET_MS / 10)
  })
})

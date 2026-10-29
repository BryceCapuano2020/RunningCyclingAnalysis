import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import { drawSeason, seasonDigests } from './sessionSample'
import {
  DEFAULT_ATHLETE,
  SAMPLE_REFERENCE_NOW_MS,
  generateSampleActivity,
  samplePlan,
} from './synthetic'
import { fastestMs } from './test/timing'

/**
 * What "See a sample athlete" costs: the season is drawn second by second and digested in the worker
 * before the first result shows. A cold load takes about 0.35 s of CPU locally (planning alone under 5 ms),
 * and a load of a season the worker already holds is the analysis alone. The cold budget is about three
 * times the idle cold time (it ran 1.4 s at a machine load of 60, so 800 ms failed on a busy runner), so a season that grows by a few dozen long sessions, or a drawing that gets several times
 * slower, fails it even on a loaded runner. The earlier budget was six times the time and passed a sevenfold
 * slowdown.
 */
const COLD_LOAD_BUDGET_MS = 1000
const WARM_LOAD_BUDGET_MS = 150
const PLAN_BUDGET_MS = 50
const WEEK_MS = 7 * 86_400_000
const SETTINGS = { massKg: 75, bikeMassKg: 9 }
/** A clock with a zone of its own, as the app's is. Each week is a new season, so a load of it is cold. */
const appClock = (week: number) => ({
  nowMs: SAMPLE_REFERENCE_NOW_MS + week * WEEK_MS,
  utcOffsetMinutes: () => -420,
})

describe('the sample athlete’s load time', () => {
  it(`draws, digests and analyses a new season in under ${COLD_LOAD_BUDGET_MS} ms`, () => {
    let loaded = 0
    let week = 100
    const ms = fastestMs(() => {
      loaded = new AnalysisSession().loadSample(SETTINGS, appClock(week++)).totalActivities
    }, 3)
    expect(loaded).toBe(samplePlan().length)
    expect(ms).toBeLessThan(COLD_LOAD_BUDGET_MS)
  })

  it(`loads a season the worker already drew in under ${WARM_LOAD_BUDGET_MS} ms`, () => {
    const clock = appClock(200)
    new AnalysisSession().loadSample(SETTINGS, clock)
    const ms = fastestMs(() => {
      new AnalysisSession().loadSample(SETTINGS, clock)
    }, 3)
    expect(ms).toBeLessThan(WARM_LOAD_BUDGET_MS)
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
    expect(ms).toBeLessThan(COLD_LOAD_BUDGET_MS / 10)
  })
})

/** Real drawings of the season, which take seconds under coverage, so they run here with the timings. */
describe('the cached sample season', () => {
  it('gives each clock the season drawn for it, never another’s, once cached', () => {
    const here = { nowMs: Date.UTC(2033, 4, 5, 9), utcOffsetMinutes: () => -420 }
    const elsewhere = { nowMs: here.nowMs, utcOffsetMinutes: () => 540 }
    const body = { massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: DEFAULT_ATHLETE.bikeMassKg }
    for (const clock of [here, elsewhere]) seasonDigests(clock)

    for (const clock of [elsewhere, here]) {
      const fresh = drawSeason(clock)
      // Now a cache hit, and it must be what a drawing for that clock makes.
      expect(seasonDigests(clock)).toEqual(fresh)
      // The sample is analysed with its own body, so the same digests analysed with it must agree.
      const loaded = new AnalysisSession().loadSample(body, clock)
      const direct = new AnalysisSession().loadDigests(fresh, body)
      expect(loaded.totalActivities).toBe(fresh.length)
      expect(loaded.library).toEqual(direct.library)
      expect(loaded.result).toEqual(direct.result)
    }
    // Another zone starts its activities at other instants, so a wrong hit could not pass for it.
    expect(seasonDigests(here)).not.toEqual(seasonDigests(elsewhere))
  }, 60_000)
})

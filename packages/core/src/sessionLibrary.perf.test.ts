import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import type { AthleteSettings } from './types'
import { copiedLibrary } from './test/libraryFixture'
import { fastestMs } from './test/timing'

/**
 * What a session costs on a library of 2,000 activities, about four years of ten a week, in the worker.
 * Locally an all-time load takes about 80 ms, the default 12 weeks about 21 ms and a change of body
 * mass about 19 ms; before the draws were sorted by their bits and a week's activities were found by
 * search, they took about 175, 65 and 62 ms. The budgets are about four times the current figures, so a
 * pass per activity added to the state, or a sort that goes back to a comparison, fails them on a loaded
 * runner too.
 */
const ACTIVITIES = 2000
const ALL_TIME_BUDGET_MS = 300
const DEFAULT_BUDGET_MS = 80
const MASS_CHANGE_BUDGET_MS = 80
/**
 * The same library with hard efforts in both sports, whose thresholds the effort gate keeps: the path that fits them, cuts the
 * zones' thresholds by week and reads the sessions that reached a hard heart rate. The default library has none, so its figures
 * above time the gate's refusals only. These efforts are longer and steadier, so the same activities cost more to digest into
 * a state (a heart-rate check of about a third more blocks), and the budgets are their own.
 */
const HARD_ALL_TIME_BUDGET_MS = 1200
const HARD_DEFAULT_BUDGET_MS = 1000
const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

describe('session performance on a large library', () => {
  const digests = copiedLibrary(ACTIVITIES)

  it(`loads and analyses all of ${ACTIVITIES} activities in under ${ALL_TIME_BUDGET_MS} ms`, () => {
    let analysed = 0
    const ms = fastestMs(() => {
      const session = new AnalysisSession()
      session.choosePeriod('all')
      analysed = session.loadDigests(digests, SETTINGS).totalActivities
    }, 5)
    expect(analysed).toBe(ACTIVITIES)
    expect(ms).toBeLessThan(ALL_TIME_BUDGET_MS)
  })

  it(`loads the default 12 weeks of ${ACTIVITIES} activities in under ${DEFAULT_BUDGET_MS} ms`, () => {
    let period = 0
    const ms = fastestMs(() => {
      period = new AnalysisSession().loadDigests(digests, SETTINGS).period.days ?? 0
    }, 5)
    expect(period).toBeGreaterThan(0)
    expect(ms).toBeLessThan(DEFAULT_BUDGET_MS)
  })

  it(`re-analyses all time for a new body mass in under ${MASS_CHANGE_BUDGET_MS} ms`, () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    session.loadDigests(digests, SETTINGS)
    let massKg = SETTINGS.massKg
    let kept = 0
    const ms = fastestMs(() => {
      massKg += 1
      kept = session.setSettings({ massKg, bikeMassKg: SETTINGS.bikeMassKg }).library.length
    }, 5)
    expect(kept).toBe(ACTIVITIES)
    expect(ms).toBeLessThan(MASS_CHANGE_BUDGET_MS)
  })

  describe('with hard efforts, where the thresholds are fitted', () => {
    const hard = copiedLibrary(ACTIVITIES, { hard: true })

    it(`loads and analyses all of ${ACTIVITIES} activities in under ${HARD_ALL_TIME_BUDGET_MS} ms`, () => {
      let fitted: unknown = null
      const ms = fastestMs(() => {
        const session = new AnalysisSession()
        session.choosePeriod('all')
        fitted = session.loadDigests(hard, SETTINGS).result?.runCp ?? null
      }, 5)
      // The fit is kept, so the time is of the path that fits it and not of a refusal.
      expect(fitted).not.toBeNull()
      expect(ms).toBeLessThan(HARD_ALL_TIME_BUDGET_MS)
    })

    it(`loads the default 12 weeks in under ${HARD_DEFAULT_BUDGET_MS} ms`, () => {
      let period = 0
      const ms = fastestMs(() => {
        period = new AnalysisSession().loadDigests(hard, SETTINGS).period.days ?? 0
      }, 5)
      expect(period).toBeGreaterThan(0)
      expect(ms).toBeLessThan(HARD_DEFAULT_BUDGET_MS)
    })
  })
})

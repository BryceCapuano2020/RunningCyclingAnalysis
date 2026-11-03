import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants'
import { AnalysisSession } from './session'
import type { AthleteSettings } from './types'
import { copiedLibrary } from './test/libraryFixture'
import { fastestMs } from './test/timing'

/**
 * What a session costs on a library of 2,000 activities, about four years of ten a week, in the worker.
 * Locally an all-time load takes about 250 ms, 12 weeks about 21 ms and a change of body
 * mass about 30 ms; before the draws were sorted by their bits and a week's activities were found by
 * search, they took about 175, 65 and 62 ms. A change of body mass had grown to about 55 ms as the state
 * took in zones, trends and records, until what it does not read (the runs, the draws, the library's
 * order) was kept, the judgement's work was shared with the analysis of the whole library and each best
 * stopped making a point for every candidate. The budgets are well over the current figures, so a pass per
 * activity added to the state, or a sort that goes back to a comparison, fails them on a loaded runner too.
 *
 * An all-time load was about 80 ms until all time reported every week of the same heart rate, not the newest 52 of each
 * sport. This library has about 390 such weeks, each a Theil-Sen fit of 200 draws at about 0.55 ms, so the weekly fits are
 * about 215 ms of the 250 and the cost grows with the weeks, not with the activities. Each week's fit is the cost it was; the
 * findings, which do not draw the weeks, still read the newest 52. The runner took 359 ms with the weeks, so the budget is 450.
 * The search that ends on all time pays the same weekly fits (308 ms on the runner against 300), so its budget is 450 for the same reason.
 *
 * The default period is a search over 12 weeks, 26 weeks and 12 months (answer/window.ts), each analysed through the period
 * cache and the search stopping at the first window where every sport qualifies. The library here has no hard effort, so
 * none qualifies and the default analyses all three before it takes the shortest: about 60 ms against about 45 for 12 weeks
 * picked by hand. Where a sport has too few activities in all three the search ends on all time, which costs three small
 * windows more than the all-time load itself (about 90 ms against 90): the same library with its rides older than a year.
 *
 * A change of body mass took about 42 ms here (budget 80) until pace and power zones were cut from a floor
 * where no fit stands (zones.ts, `floorAt`). This library has no hard effort, so no fit ever stood and its 2,000 activities had no
 * pace or power zones to count; now each is cut and counted, as a library with fits always paid. That is about 7 ms more here (the
 * zones' own time roughly doubles, 2 to 4.5 ms, and the rest was not traced to one step), and the runner took 81 ms, so the budget is 100.
 * The floors cost nothing in the judgement (each activity's two bests, 0.4 ms), and the work is not shared between masses: a
 * ride's power zones read the mass, and the zone times are kept by it.
 */
const ACTIVITIES = 2000
const ALL_TIME_BUDGET_MS = 450
const DEFAULT_BUDGET_MS = 80
const SEARCH_BUDGET_MS = 160
const SEARCH_TO_ALL_TIME_BUDGET_MS = 450
const MASS_CHANGE_BUDGET_MS = 100
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

  it(`loads 12 weeks picked of ${ACTIVITIES} activities in under ${DEFAULT_BUDGET_MS} ms`, () => {
    let period = 0
    const ms = fastestMs(() => {
      const session = new AnalysisSession()
      session.choosePeriod(84)
      period = session.loadDigests(digests, SETTINGS).period.days ?? 0
    }, 5)
    expect(period).toBe(84)
    expect(ms).toBeLessThan(DEFAULT_BUDGET_MS)
  })

  it(`searches all three windows for the default of ${ACTIVITIES} activities in under ${SEARCH_BUDGET_MS} ms`, () => {
    let answer = ''
    const ms = fastestMs(() => {
      const state = new AnalysisSession().loadDigests(digests, SETTINGS)
      answer = `${state.answerWindow.reason}/${state.period.days}`
    }, 5)
    // No window qualifies, so the shortest with evidence for both sports is taken after the three are analysed.
    expect(answer).toBe('most/84')
    expect(ms).toBeLessThan(SEARCH_BUDGET_MS)
  })

  it(`searches to all time when a sport is missing from every window, in under ${SEARCH_TO_ALL_TIME_BUDGET_MS} ms`, () => {
    const newest = Math.max(...digests.map((digest) => digest.startMs))
    const ridesOld = digests.filter(
      (digest) => digest.sport !== 'ride' || digest.startMs < newest - 400 * DAY_MS,
    )
    let answer = ''
    const ms = fastestMs(() => {
      const state = new AnalysisSession().loadDigests(ridesOld, SETTINGS)
      answer = `${state.answerWindow.reason}/${state.answerWindow.passed.length}`
    }, 5)
    expect(answer).toBe('all-time/3')
    expect(ms).toBeLessThan(SEARCH_TO_ALL_TIME_BUDGET_MS)
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
    console.info(`${ACTIVITIES} activities: body mass change ${ms.toFixed(0)} ms`)
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

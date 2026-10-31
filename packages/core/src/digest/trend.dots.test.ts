import { describe, expect, it } from 'vitest'
import { NO_EFFORT_REFERENCE } from '../effort'
import type { EffortReference } from '../effort'
import type { ActivityDigest, AthleteSettings } from '../types'
import { PeriodCache } from '../periodCache'
import { dotsRule, hardEffortRule, shownNotHard } from './hardEffortRule'
import { fitnessTrend } from './trend'
import { dotCount } from './trendPoints'
import { levelRun } from './test/runLibrary'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const REFERENCE_BPM = 190

const reference = (reading: 'trusted' | 'low' | 'thin' | null): EffortReference => ({
  ...NO_EFFORT_REFERENCE,
  referenceHr: { run: REFERENCE_BPM, ride: null },
  reading: { run: reading, ride: null },
})

/** A run on a day (from the first Monday) whose 30 s peak heart rate was `peak`, or null for none. */
function run(id: string, day: number, level: number, peak: number | null): ActivityDigest {
  const base = levelRun(id, day, level)
  return { ...base, maxHeartRate: peak, hasHeartRate: peak !== null, distributions: undefined }
}

/** A hard run in the first week and an easy one five weeks later, so a two-week window holds one or the other. */
const HARD = run('hard', 0, 1.2, 185)
const EASY = run('easy', 35, 1.1, 140)

const trend = (rule?: ReturnType<typeof dotsRule>) =>
  fitnessTrend([HARD, EASY], SETTINGS, { windowDays: 14, ...(rule === undefined ? {} : { rule }) })

const leaders = (points: ReturnType<typeof trend>) =>
  points.flatMap((point) => (point.runAtMs === null ? [] : [point.runAtMs]))

describe('the bests-over-time dots and the effort gate', () => {
  it('lead a window with any effort when no rule is given, easy ones too', () => {
    const at = new Set(leaders(trend()))
    expect(at).toEqual(new Set([HARD.startMs, EASY.startMs]))
  })

  it('leave out an effort heart rate shows was not hard, so its weeks have no dot', () => {
    const points = trend(dotsRule(reference('trusted'), []))
    expect(new Set(leaders(points))).toEqual(new Set([HARD.startMs]))
    // The weeks around the easy run hold no dot at all, and the hard run's weeks keep theirs.
    const easyWeek = points.find((point) => point.endMs >= EASY.startMs)
    expect(easyWeek?.runWkg).toBeNull()
    expect(easyWeek?.runCount).toBe(0)
    expect(points.some((point) => point.runWkg !== null)).toBe(true)
  })

  it('keep what heart rate cannot judge: no heart rate, a reference that cannot say, a library too thin', () => {
    const blank = [run('hard', 0, 1.2, null), run('easy', 35, 1.1, null)]
    const none = fitnessTrend(blank, SETTINGS, {
      windowDays: 14,
      rule: dotsRule(reference('trusted'), []),
    })
    expect(new Set(leaders(none))).toEqual(new Set([blank[0]!.startMs, blank[1]!.startMs]))
    for (const reading of ['low', 'thin', null] as const) {
      const kept = trend(dotsRule(reference(reading), []))
      expect(new Set(leaders(kept)), String(reading)).toEqual(new Set([HARD.startMs, EASY.startMs]))
    }
  })

  it('leave out an effort of an activity whose heart rate is set aside only if it was shown easy: set aside cannot be judged', () => {
    const kept = trend(dotsRule(reference('trusted'), [EASY.id]))
    expect(new Set(leaders(kept))).toEqual(new Set([HARD.startMs, EASY.startMs]))
  })

  it('has a rule that says which points are shown not hard, and is keyed by what it was made from', () => {
    const rule = dotsRule(reference('trusted'), [])
    const point = HARD.curve[10]!
    expect(shownNotHard(HARD, point, reference('trusted'), new Set())).toBe(false)
    expect(shownNotHard(EASY, EASY.curve[10]!, reference('trusted'), new Set())).toBe(true)
    expect(rule.key).not.toBe(dotsRule(reference('low'), []).key)
    expect(rule.key).not.toBe(dotsRule(reference('trusted'), ['x']).key)
  })
})

describe('the dots and the change test read the one gate', () => {
  const NOT_HARD = run('easy2', 10, 1.1, 140)
  const NO_HEART_RATE = run('blank', 11, 1.1, null)
  const SPRINT = { ...HARD, curve: [{ ...HARD.curve[0]!, durationS: 30 }] } as ActivityDigest
  const outcomes = (rule: ReturnType<typeof dotsRule>, digest: ActivityDigest) =>
    rule.rule.point(digest, digest.curve[digest.curve.length > 10 ? 10 : 0]!)

  it('agree on a hard effort, an easy one and a sprint, and differ only where heart rate cannot judge', () => {
    const trusted = reference('trusted')
    const dots = dotsRule(trusted, ['set-aside'])
    const change = hardEffortRule(trusted, ['set-aside'])
    // Agree: hard counts, shown easy does not, a sprint (no heart rate to judge it by) counts.
    expect([outcomes(dots, HARD), outcomes(change, HARD)]).toEqual([true, true])
    expect([outcomes(dots, NOT_HARD), outcomes(change, NOT_HARD)]).toEqual([false, false])
    expect([outcomes(dots, SPRINT), outcomes(change, SPRINT)]).toEqual([true, true])
    // Differ, and only here: no heart rate, one set aside, a reference that cannot say. The change test needs evidence
    // of a hard effort and leaves them out; the dots withhold only what is shown easy, so they stay.
    const aside = { ...NOT_HARD, id: 'set-aside' }
    for (const digest of [NO_HEART_RATE, aside]) {
      expect([outcomes(dots, digest), outcomes(change, digest)], digest.id).toEqual([true, false])
    }
    const thin = [dotsRule(reference('thin'), []), hardEffortRule(reference('thin'), [])] as const
    expect([outcomes(thin[0], NOT_HARD), outcomes(thin[1], NOT_HARD)]).toEqual([true, false])
  })
})

describe('which lengths the dots rule left empty', () => {
  const EASY_ONLY = [run('e1', 0, 1.1, 140), run('e2', 35, 1.0, 140)]
  const cache = new PeriodCache()
  const read = (rule?: ReturnType<typeof dotsRule>) => {
    const shown = cache.trends(EASY_ONLY, SETTINGS, 42, null, undefined, undefined, rule)
    const withheld = cache.dotsWithheld(
      EASY_ONLY,
      SETTINGS,
      42,
      null,
      undefined,
      shown,
      undefined,
      rule,
    )
    return { shown, withheld }
  }

  it('names the gate when it leaves a length too few dots that the period has without it', () => {
    const { shown, withheld } = read(dotsRule(reference('trusted'), []))
    expect(dotCount(shown[1200], 'run')).toBe(0)
    expect(withheld.run[1200]).toBe(true)
    expect(withheld.ride[1200]).toBe(false)
  })

  it('names nothing without the rule, or where the dots still draw', () => {
    expect(read().withheld.run[1200]).toBe(false)
    const kept = read(dotsRule(reference('thin'), []))
    expect(dotCount(kept.shown[1200], 'run')).toBeGreaterThanOrEqual(2)
    expect(kept.withheld.run[1200]).toBe(false)
  })
})

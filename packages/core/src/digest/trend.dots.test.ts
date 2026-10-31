import { describe, expect, it } from 'vitest'
import { NO_EFFORT_REFERENCE } from '../effort'
import type { EffortReference } from '../effort'
import type { ActivityDigest, AthleteSettings } from '../types'
import { dotsRule, shownNotHard } from './hardEffortRule'
import { fitnessTrend } from './trend'
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

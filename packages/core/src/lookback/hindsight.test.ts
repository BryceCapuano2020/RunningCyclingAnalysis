import { describe, expect, it } from 'vitest'
import { replaySim, simulate } from '../fitness/test/runSim'
import type { SimSpec } from '../fitness/test/runSim'
import { WEEK_ORIGIN_MS } from '../calendar'
import { DAY_MS } from '../constants'
import type { RunPoint } from '../fitness/windows'
import { isBackLevel } from '../fitness/episode'
import { isBack } from './episodes'
import { hindsightOf } from './hindsight'
import type { HindsightInput } from './hindsight'
import type { HindsightFitness } from './types'

/** A library with no wander: the level is the planted one, so the cuts are the planted ones. */
const QUIET: Partial<SimSpec> = { level: { wanderSd: 0, runSd: 0.03 } }
const weekMs = (w: number) => WEEK_ORIGIN_MS + w * 7 * DAY_MS

function years(
  spec: Partial<SimSpec> & Pick<SimSpec, 'weeks'>,
  seed = 1,
  drop?: (r: RunPoint) => boolean,
) {
  const all = simulate({ perWeek: 3, ...QUIET, ...spec }, seed)
  const runs = drop === undefined ? all : all.filter((r) => !drop(r))
  const input: HindsightInput = {
    runs,
    activeDays: runs.map((r) => r.t),
    asOfDay: spec.weeks * 7,
  }
  return hindsightOf(input)
}

const told = (r: ReturnType<typeof years>): HindsightFitness => {
  if (r.kind !== 'ok') throw new Error(`not told: ${r.kind}`)
  return r
}

describe('a sport that did not change', () => {
  const result = told(years({ weeks: 156 }))

  it('is one plateau with no episode, told through the horizon, and quiet', () => {
    expect(result.levels).toHaveLength(1)
    expect(result.episodes).toEqual([])
    expect(result.toMs).toBeLessThan(weekMs(156) - 11 * 7 * DAY_MS)
    expect(result.quiet).toHaveLength(1)
    // The run's own spread and the printed range are in it: a level that never moved is told as within about 6%.
    expect(result.quiet[0]!.within).toBeLessThan(0.08)
    expect(result.quiet[0]!.runs).toBeGreaterThan(300)
    expect(result.thin).toEqual([])
    expect(result.breaks).toEqual([])
  })
})

describe('episodes', () => {
  it('lists a fall that did not come back as open at the horizon, dated and ranged', () => {
    const result = told(years({ weeks: 156, planted: [{ type: 'step', week: 70, size: -0.08 }] }))
    expect(result.levels).toHaveLength(2)
    const [slip] = result.episodes
    expect(result.episodes).toHaveLength(1)
    expect(slip!.kind).toBe('slip-open')
    expect(slip!.toMs).toBeNull()
    expect(Math.abs(slip!.fromMs - weekMs(70))).toBeLessThan(3 * 7 * DAY_MS)
    expect(slip!.change.value).toBeCloseTo(-0.077, 1)
    expect(slip!.change.high).toBeLessThan(0)
    expect(slip!.change.low).toBeLessThan(slip!.change.value)
  })

  it('lists a dip that came back as slip-back, with how much came back', () => {
    const result = told(
      years({
        weeks: 200,
        planted: [
          { type: 'step', week: 60, size: -0.08 },
          { type: 'step', week: 110, size: 0.08 },
        ],
      }),
    )
    expect(result.episodes.map((e) => e.kind)).toEqual(['slip-back'])
    const [dip] = result.episodes
    expect(dip!.regained!.value).toBeGreaterThan(0.06)
    expect(dip!.remaining).toBeNull()
    expect(dip!.toMs).toBeGreaterThan(dip!.fromMs + 40 * 7 * DAY_MS)
  })

  it('does not call a return that leaves 5.5% missing back: it is partly back, and says what remains', () => {
    const result = told(
      years({
        weeks: 220,
        planted: [
          { type: 'step', week: 60, size: -0.12 },
          { type: 'step', week: 110, size: 0.065 },
        ],
      }),
    )
    expect(result.episodes.map((e) => e.kind)).toEqual(['slip-partly-back'])
    const [dip] = result.episodes
    expect(dip!.remaining!.value).toBeLessThan(-0.04)
    expect(dip!.remaining!.value).toBeGreaterThan(-0.07)
  })

  it('lists a rise that held as an improvement, and a slide as one episode of several steps', () => {
    const rise = told(years({ weeks: 156, planted: [{ type: 'step', week: 70, size: 0.09 }] }))
    expect(rise.episodes.map((e) => e.kind)).toEqual(['improvement'])
    expect(rise.episodes[0]!.change.low).toBeGreaterThan(0)
    const slide = told(
      years({ weeks: 200, planted: [{ type: 'ramp', week: 60, size: -0.12, weeks: 40 }] }),
    )
    expect(slide.episodes).toHaveLength(1)
    expect(slide.episodes[0]!.kind).toBe('slip-open')
    expect(slide.episodes[0]!.change.value).toBeLessThan(-0.09)
  })

  it('lists a step beside a break of eight weeks or more with no run as after-break, and the break itself', () => {
    const result = told(
      years(
        { weeks: 200, planted: [{ type: 'step', week: 90, size: -0.12 }] },
        1,
        (r) => r.t >= 82 * 7 && r.t < 92 * 7,
      ),
    )
    expect(result.breaks).toHaveLength(1)
    expect(result.episodes.map((e) => e.kind)).toEqual(['after-break'])
  })

  it('tells a stretch of runs without a steady one apart from a break', () => {
    const runs = simulate({ perWeek: 3, weeks: 156, ...QUIET }, 2)
    const steady = runs.filter((r) => !(r.t >= 80 * 7 && r.t < 92 * 7))
    // Easy and interval runs went on through those 12 weeks, so there is no break, only no steady runs.
    const active = [...runs.map((r) => r.t)]
    const result = told(hindsightOf({ runs: steady, activeDays: active, asOfDay: 156 * 7 }))
    expect(result.breaks).toEqual([])
    expect(result.thin).toHaveLength(1)
  })

  it('lists nothing under 8% in a library under two years, where a season cannot be told from a change', () => {
    const six = told(years({ weeks: 90, planted: [{ type: 'step', week: 45, size: -0.06 }] }))
    expect(six.episodes).toEqual([])
    const eleven = told(years({ weeks: 90, planted: [{ type: 'step', week: 45, size: -0.11 }] }))
    expect(eleven.episodes.map((e) => e.kind)).toEqual(['slip-open'])
  })
})

describe('a sport without enough', () => {
  it('has the counts it lacks, not years', () => {
    const result = years({ weeks: 50, perWeek: 1 })
    expect(result).toMatchObject({ kind: 'too-short', needSteady: 40, needWeeks: 52 })
    if (result.kind === 'too-short') expect(result.steady).toBeLessThan(40)
  })

  it('needs 52 weeks before the horizon, so 64 weeks of data', () => {
    expect(years({ weeks: 60 }).kind).toBe('too-short')
    expect(years({ weeks: 66 }).kind).toBe('ok')
  })
})

describe('what is posted', () => {
  it('is small however long the library: no list past its cap, nothing per week', () => {
    const wander = told(
      years({ weeks: 520, level: { wanderSd: 0.03, wanderRho: 0.95, runSd: 0.03 } }, 3),
    )
    expect(wander.levels.length).toBeLessThanOrEqual(16)
    expect(wander.episodes.length).toBeLessThanOrEqual(10)
    for (const list of [wander.quiet, wander.thin, wander.breaks]) {
      expect(list.length).toBeLessThanOrEqual(6)
    }
    expect(JSON.stringify(wander).length).toBeLessThan(8000)
  })
})

describe('the back test', () => {
  const level = (m: number, se: number) => ({ fromWeek: 0, toWeek: 10, m, se, n: 30 })

  it('is the live monitor test, with the model-error floor in the standard error', () => {
    const pre = level(0, 0.002)
    const post = level(-0.009, 0.002)
    // Tight levels and no floor: -0.9% is back (the point bar -1%, the lower bound over -2%).
    expect(isBack(pre, post, 0)).toBe(true)
    // The same levels under a 1.5% floor have a lower bound past -2%: partly back, as the live state would call it.
    expect(isBack(pre, post, 0.015)).toBe(false)
    const se = Math.sqrt(0.002 ** 2 + 0.002 ** 2 + 0.015 ** 2)
    expect(isBack(pre, post, 0.015)).toBe(isBackLevel(-0.009, se))
    expect(isBack(pre, level(-0.011, 0.002), 0)).toBe(false)
  })
})

describe('a recovery the card said back for', () => {
  const dip = [
    { type: 'step' as const, week: 90, size: -0.08 },
    { type: 'step' as const, week: 140, size: 0.08 },
  ]
  const library = (planted: typeof dip) =>
    simulate({ weeks: 200, perWeek: 3, planted, ...QUIET }, 8)
  const kinds = (runs: RunPoint[], records?: ReturnType<typeof replaySim>) => {
    const result = hindsightOf({ runs, activeDays: runs.map((r) => r.t), asOfDay: 1400, records })
    return result.kind === 'ok' ? result.episodes.map((e) => e.kind) : []
  }
  const runs = library(dip)
  const records = replaySim(runs, 200)

  it('is back when the card reached back for it, and only partly back on the floor test alone', () => {
    expect(kinds(runs)).toEqual(['slip-partly-back'])
    expect(kinds(runs, records)).toEqual(['slip-back'])
  })

  it('stays partly back when the card reopened the slip after back', () => {
    const at = records.findIndex((r) => r.state === 'back' && r.fresh)
    expect(at).toBeGreaterThan(0)
    const reopened = records.map((r, i) =>
      i === at + 1 ? { ...r, state: 'slipping' as const, fresh: true } : r,
    )
    expect(kinds(runs, reopened)).toEqual(['slip-partly-back'])
  })

  it('stays partly back when the level after the return is clearly lower, whatever the card said', () => {
    // A fall of 12% and a return of 6.5% leaves about 6% missing; the card's back belongs to the other library.
    const residual = library([
      { type: 'step', week: 90, size: -0.12 },
      { type: 'step', week: 140, size: 0.065 },
    ])
    expect(kinds(residual, records)).toEqual(['slip-partly-back'])
  })

  it('ignores a back that belongs to another slip', () => {
    const elsewhere = records.map((r) => Object.assign({}, r, { w: r.w + 60 }))
    expect(kinds(runs, elsewhere)).toEqual(['slip-partly-back'])
  })
})

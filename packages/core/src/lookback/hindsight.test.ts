import { describe, expect, it } from 'vitest'
import { simulate } from '../fitness/test/runSim'
import type { SimSpec } from '../fitness/test/runSim'
import { WEEK_ORIGIN_MS } from '../calendar'
import { DAY_MS } from '../constants'
import type { RunPoint } from '../fitness/windows'
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

  it('is one plateau, told through the horizon, and quiet', () => {
    expect(result.levels).toHaveLength(1)
    expect(result.toMs).toBeLessThan(weekMs(156) - 11 * 7 * DAY_MS)
    expect(result.quiet).toHaveLength(1)
    // The run's own spread and the printed range are in it: a level that never moved is told as within about 6%.
    expect(result.quiet[0]!.within).toBeLessThan(0.08)
    expect(result.quiet[0]!.runs).toBeGreaterThan(300)
    expect(result.thin).toEqual([])
    expect(result.breaks).toEqual([])
  })
})

describe('plateaus and breaks', () => {
  it('cuts a fall that did not come back into two plateaus', () => {
    const result = told(years({ weeks: 156, planted: [{ type: 'step', week: 70, size: -0.08 }] }))
    expect(result.levels).toHaveLength(2)
    expect(result.levels[1]!.value).toBeLessThan(result.levels[0]!.value)
  })

  it('lists a stretch of eight weeks or more with no run as a break', () => {
    const result = told(
      years(
        { weeks: 200, planted: [{ type: 'step', week: 90, size: -0.12 }] },
        1,
        (r) => r.t >= 82 * 7 && r.t < 92 * 7,
      ),
    )
    expect(result.breaks).toHaveLength(1)
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
    for (const list of [wander.quiet, wander.thin, wander.breaks]) {
      expect(list.length).toBeLessThanOrEqual(6)
    }
    expect(JSON.stringify(wander).length).toBeLessThan(8000)
  })
})

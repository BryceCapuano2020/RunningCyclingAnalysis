import { describe, expect, it, vi } from 'vitest'
import { MIXING_STEP, firstWeekOf, replaySim, simulate, slipWeeks } from './test/runSim'
import type { SimSpec } from './test/runSim'

vi.setConfig({ testTimeout: 600_000 })

/**
 * The monitor over a library part-way through a rebuild (D12 section 1.8): the oldest or the newest share of the runs
 * read revision 6's grade credit and the rest revision 7's, a contiguous step in what a run reads, the same shape as a
 * watch change, laid in both directions.
 *
 * The step is 0.5% (a log-change). The mixing study measures the change of the fitness value between a mixture and the
 * library on revision 7 alone at 0.014% at most (`mixingStudy.test.ts` keeps this step above that, with room), because the
 * fit takes only a few thousandths of the grade credit (the steady-pace unit's fitted share) and revision 7 changes the
 * credit only of kilometres with a descent steeper than 4%. A step of 1.4% (the credit of the descent library read
 * whole, which the strict unit of a library under 300 km would take) is not tolerated: its false slips reach 0.27 an
 * athlete-year. The 0.5% here is what the monitor does tolerate, so a library that stays inside it is safe to mix.
 * The library with a temperature (E2) is not inside it: the warm-day term moves its fitness by 5% when the library holds both
 * revisions, so revision 7 is `exclusive` (the mixing study, `mixingStudy.node.test.ts`) and this step is the monitor's tolerance, not a licence to mix.
 *
 * Criteria: false slips an athlete-year at most the budget of monitor.sim.test.ts (0.2) plus 10% relative, and a
 * planted persistent loss detected within 0.1 of the rate with no step.
 */
const BUDGET = 0.2 * 1.1
const RATES = [1.2, 2, 3, 5]
const YEARS = 3
const SHARES = [0.1, 0.25, 0.5, 0.75, 0.9]

function falseAlarms(spec: Partial<SimSpec>, libraries = 25): number {
  let alarms = 0
  for (const perWeek of RATES) {
    for (let seed = 1; seed <= libraries; seed++) {
      const weeks = YEARS * 52
      alarms += slipWeeks(
        replaySim(simulate({ ...spec, weeks, perWeek }, seed + 1000), weeks),
      ).length
    }
  }
  return alarms / (RATES.length * libraries * YEARS)
}

function detected(spec: Partial<SimSpec>, seeds = 40): number {
  let found = 0
  const planted = [{ type: 'step' as const, week: 60, size: -0.08 }]
  for (let seed = 1; seed <= seeds; seed++) {
    const full: SimSpec = { weeks: 130, perWeek: 3, planted, ...spec }
    if (firstWeekOf(replaySim(simulate(full, seed), full.weeks), 60, 'slipping') !== null) found++
  }
  return found / seeds
}

describe('false slips an athlete-year in a library part-way through a rebuild', () => {
  it('stays under the budget plus 10% for every share on revision 7, from either end, in either direction', () => {
    const rates: Record<string, number> = {}
    for (const side of ['oldest', 'newest'] as const) {
      for (const share of SHARES) {
        for (const size of [MIXING_STEP, -MIXING_STEP]) {
          rates[`${side} ${share} ${size}`] = falseAlarms({ revisionStep: { share, size, side } })
        }
      }
    }
    const over = Object.entries(rates).filter(([, rate]) => rate > BUDGET)
    expect(over).toEqual([])
  })
})

describe('a planted loss of 8% in a library part-way through a rebuild', () => {
  const alone = detected({})

  it('is found about as often as without the step: within 0.1, for every share, from either end', () => {
    const worse: string[] = []
    for (const side of ['oldest', 'newest'] as const) {
      for (const share of SHARES) {
        for (const size of [MIXING_STEP, -MIXING_STEP]) {
          const rate = detected({ revisionStep: { share, size, side } })
          if (Math.abs(rate - alone) > 0.1)
            worse.push(`${side} ${share} ${size}: ${rate} against ${alone}`)
        }
      }
    }
    expect(worse).toEqual([])
  })
})

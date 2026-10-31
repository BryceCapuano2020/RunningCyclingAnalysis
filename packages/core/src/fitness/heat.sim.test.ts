import { describe, expect, it, vi } from 'vitest'
import { heatOf, heatTerm } from './heat'
import { replayHeat, simulateWithHeat, slipsPerYear } from './test/heatSim'
import type { HeatSpec } from './test/heatSim'
import { firstWeekOf, replaySim, slipWeeks } from './test/runSim'

vi.setConfig({ testTimeout: 600_000 })

/**
 * The warm-day term on simulated run values (monitor.sim.test.ts has the quiet athlete's budget of about 0.2 slips an
 * athlete-year). Each run has a day's warmth on the sensor's index, a yearly swing, and a warm day costs `b` log units
 * for every ten degrees above the athlete's cooler runs; the file records the index on `coverage` of the runs. Three
 * years of runs at 1.2, 2, 3 and 5 a week, 20 libraries each. Budgets sit above what these seeds show.
 */
const RATES = [1.2, 2, 3, 5]
const SEEDS = 20
const WEEKS = 156
const heat = (over: Partial<HeatSpec['heat']> = {}): HeatSpec['heat'] => ({
  b: 0.02,
  coverage: 1,
  ...over,
})
const quiet = (over: Partial<HeatSpec['heat']> = {}): Omit<HeatSpec, 'perWeek'> => ({
  weeks: WEEKS,
  heat: heat(over),
})

describe('false slips an athlete-year', () => {
  it('stays at the budget for an athlete who does not slow in the heat, term on or off', () => {
    // Observed 0.125 on, 0.129 off.
    const on = slipsPerYear(quiet({ b: 0 }), RATES, SEEDS, true)
    expect(on).toBeLessThan(0.2)
    expect(on).toBeLessThanOrEqual(slipsPerYear(quiet({ b: 0 }), RATES, SEEDS, false) + 0.02)
  })

  it('falls to the budget when the athlete slows in the heat and the index swings with the year', () => {
    // Observed: 2% a ten degrees 0.24 off, 0.17 on; 4% a ten degrees 0.45 off, 0.20 on.
    const light = quiet({ b: 0.02 })
    expect(slipsPerYear(light, RATES, SEEDS, false)).toBeGreaterThan(0.2)
    expect(slipsPerYear(light, RATES, SEEDS, true)).toBeLessThan(0.22)
    const strong = quiet({ b: 0.04 })
    expect(slipsPerYear(strong, RATES, SEEDS, false)).toBeGreaterThan(0.4)
    expect(slipsPerYear(strong, RATES, SEEDS, true)).toBeLessThan(0.28)
  })

  it('doubles when the sign is inverted: the same term taken off the runs instead of added back', () => {
    // Observed 0.41 inverted against 0.17 right, at 2% a ten degrees.
    let alarms = 0
    for (const perWeek of RATES) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const runs = simulateWithHeat({ ...quiet(), perWeek }, seed + 2000)
        const term = heatTerm(runs, WEEKS * 7)
        const flipped = runs.map(({ id, t, x, c }) => ({
          id,
          t,
          x: c === null || term === null ? x : x - term.b * heatOf(c, term.cRef),
        }))
        alarms += slipWeeks(replaySim(flipped, WEEKS)).length
      }
    }
    const inverted = alarms / (RATES.length * SEEDS * (WEEKS / 52))
    expect(inverted).toBeGreaterThanOrEqual(2 * slipsPerYear(quiet(), RATES, SEEDS, true))
  })

  it('is not made worse by a watch that reads 3 index degrees higher or lower from the second year', () => {
    // Observed 0.16 and 0.20 on, 0.24 off, either way.
    for (const size of [3, -3]) {
      const spec = quiet({ biasStep: { week: 90, size } })
      expect(slipsPerYear(spec, RATES, SEEDS, true)).toBeLessThanOrEqual(
        slipsPerYear(spec, RATES, SEEDS, false) + 0.02,
      )
    }
  })
})

describe('a planted loss', () => {
  /** The share of libraries that declare a slip within `weeks` of a persistent 5% loss at week 60. */
  function detected(term: boolean, weeks: number): number {
    const seeds = 40
    let found = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const spec: HeatSpec = {
        weeks: 130,
        perWeek: 3,
        planted: [{ type: 'step', week: 60, size: -0.05 }],
        heat: heat({ b: 0.03 }),
      }
      const week = firstWeekOf(replayHeat(simulateWithHeat(spec, seed), 130, term), 60, 'slipping')
      if (week !== null && week - 60 <= weeks) found++
    }
    return found / seeds
  }

  it('is seen within 0.1 of the share without the term, at 5% and 26 weeks', () => {
    // Observed 0.85 on against 0.90 off.
    const off = detected(false, 26)
    const on = detected(true, 26)
    expect(on).toBeGreaterThanOrEqual(off - 0.1)
    expect(on).toBeGreaterThanOrEqual(0.75)
  })
})

describe('with too little of the library recorded', () => {
  it('reads exactly as it did without the term when the index is on 40% of the runs', () => {
    for (const perWeek of RATES) {
      for (let seed = 1; seed <= 5; seed++) {
        const runs = simulateWithHeat({ ...quiet({ coverage: 0.4, b: 0.03 }), perWeek }, seed)
        expect(heatTerm(runs, WEEKS * 7)).toBeNull()
        expect(replayHeat(runs, WEEKS, true)).toEqual(replayHeat(runs, WEEKS, false))
      }
    }
  })
})

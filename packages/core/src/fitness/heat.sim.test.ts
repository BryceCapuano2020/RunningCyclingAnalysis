import { describe, expect, it, vi } from 'vitest'
import { replayHeat, simulateHeat } from './test/heatSim'
import type { HeatSpec } from './test/heatSim'
import { firstWeekOf, slipWeeks } from './test/runSim'

vi.setConfig({ testTimeout: 1_800_000 })

/**
 * The warm-day term on the run-level generator (D12 section 2.1): the silence budget with a planted heat response, a
 * season and a wander, the sign, a device that reads the index off, the lag to a planted loss, and the floors. Each
 * case runs with the term off (which is D2's monitor exactly: `null`) and fitted as the status fits it. The athlete
 * loses 3% of speed per 10 index degrees above 12, in a climate that swings 9 degrees about 14, and the file records
 * the index on every run unless a case says otherwise. Rates are slip declarations an athlete-year where nothing
 * changes in the athlete, over steady runs a week of 1.2, 2, 3 and 5; 25 libraries of each, three years unless a
 * case says otherwise. "On" is the share of libraries in which the term was used.
 *
 * Observed, term off -> fitted (on), the figures this file holds the code to:
 *   heat 3%                                       0.26 -> 0.18 (94%)
 *   heat 3% adding to a season of 1.5%            0.37 -> 0.24 (94%)
 *   heat 3% hiding a season of 1.5%               0.16 -> 0.24 (94%)   see below; no heat at all: 0.24
 *   heat 3% hiding a season of 1.5%, 3% wander    0.32 -> 0.38 (93%)   see below; no heat at all: 0.41
 *   heat 3%, 3% slow wander                       0.37 -> 0.34 (93%)
 *   no heat effect                                0.17 -> 0.17 (1%)
 *   no heat effect, a season of 1.5%              0.24 -> 0.24 (1%)
 *   device 3 degrees high from week 80, heat 3%   0.26 -> 0.16;  3 low 0.26 -> 0.20
 *   device 3 degrees high / low, no heat effect   0.17 -> 0.16 / 0.17
 *   warm days faster (b = -3%)                    identical to off, the term never used
 *   the fitted term applied with the wrong sign   0.26 -> 0.37 (against 0.18 right): a guard on the code, not a world
 *   1.5 years, 1 year, heat 3%                    0.24 -> 0.24, 0.07 -> 0.07 (never on)
 *   a 5% loss seen within 26 weeks                heat 62% -> 80%; no heat effect 84% -> 84%
 * Where the heat hides a season, the athlete's own heat loss and fitness swing are in opposite phase and the monitor
 * alone reads their sum, which is small; taking the heat out leaves the season (D2 fits it from the third year), so
 * the rate rises to what the same athlete has with no heat at all (0.24 and 0.41 here; 0.25 for the season in episode.sim.test.ts).
 */
const RATES = [1.2, 2, 3, 5]
type Base = Omit<HeatSpec, 'weeks' | 'perWeek'>
const HEAT = { b: 0.03, coverage: 1 }
const CALM = { b: 0, coverage: 1 }
type Mode = 'off' | 'fit' | 'flipped'

const cache = new Map<string, { alarms: number; on: number }>()

/** Slip declarations an athlete-year where nothing changes in the athlete, and the share of libraries with the term on. */
function silence(spec: Base, mode: Mode, years = 3, libraries = 25) {
  const key = JSON.stringify([spec, mode, years, libraries])
  const known = cache.get(key)
  if (known !== undefined) return known
  let alarms = 0
  let on = 0
  for (const perWeek of RATES) {
    for (let seed = 1; seed <= libraries; seed++) {
      const weeks = Math.round(years * 52)
      const points = simulateHeat({ ...spec, weeks, perWeek }, seed + 1000)
      const run = replayHeat(points, weeks, mode === 'off' ? null : 'fit')
      if (run.term !== null) on++
      // The wrong sign takes the loss out twice: `x - b * heat`.
      const records =
        mode === 'flipped' && run.term !== null
          ? replayHeat(points, weeks, { cRef: run.term.cRef, b: -run.term.b }).records
          : run.records
      alarms += slipWeeks(records).length
    }
  }
  const n = RATES.length * libraries
  const found = { alarms: alarms / (n * years), on: on / n }
  cache.set(key, found)
  return found
}

/** The fitted rate and the rate without the term. */
const pair = (spec: Base, years = 3) => ({
  off: silence(spec, 'off', years),
  fit: silence(spec, 'fit', years),
})

describe('false alarms an athlete-year when nothing changes but the weather', () => {
  it('is under the budget with a heat response, where the monitor alone is over it', () => {
    const { off, fit } = pair({ heat: HEAT })
    expect(fit.on).toBeGreaterThan(0.85)
    expect(off.alarms).toBeGreaterThan(0.2)
    expect(fit.alarms).toBeLessThan(0.22)
    expect(fit.alarms).toBeLessThan(off.alarms)
  })

  it('is no higher than the monitor alone for libraries of two years or more (the two where the heat hides a season are held to their no-heat baseline below)', () => {
    for (const spec of [
      { heat: HEAT },
      { heat: HEAT, level: { seasonAmp: -0.015 } },
      { heat: HEAT, level: { wanderSd: 0.03, wanderRho: 0.95 } },
      { heat: CALM },
      { heat: CALM, level: { seasonAmp: 0.015 } },
    ]) {
      const { off, fit } = pair(spec)
      expect(fit.alarms, JSON.stringify(spec)).toBeLessThanOrEqual(off.alarms + 0.02)
    }
  })

  it('is no higher than the same athlete with no heat when the heat was hiding a season, with and without a 3% wander', () => {
    // The heat loss and the fitness swing are in opposite phase here, so the monitor alone reads their small sum
    // (0.16 and 0.32). Taking the heat out shows the season (0.24 and 0.38), which is what an athlete the heat does not
    // touch has: the plain seasonal baseline: 0.24 and 0.41 with no heat at all (hidden: 0.24 and 0.38). The comparison is with that baseline.
    const wander = { seasonAmp: 0.015, wanderSd: 0.03, wanderRho: 0.95 }
    for (const level of [{ seasonAmp: 0.015 }, wander]) {
      const hidden = silence({ heat: HEAT, level }, 'fit')
      const baseline = silence({ heat: CALM, level }, 'off')
      expect(hidden.alarms, JSON.stringify(level)).toBeLessThanOrEqual(baseline.alarms + 0.02)
    }
  })

  it('does not rise for an athlete the heat does not touch, and the term is used in almost none of them', () => {
    const { off, fit } = pair({ heat: CALM })
    expect(fit.on).toBeLessThan(0.08)
    expect(fit.alarms).toBeLessThanOrEqual(off.alarms + 0.02)
  })

  it('is as the monitor alone when the athlete is faster on warm days: the term is null, not negative', () => {
    // A world with the wrong sign: warm days are faster (b < 0). The fit finds a positive slope, which is no loss.
    const faster = { heat: { b: -0.03, coverage: 1 } }
    const { off, fit } = pair(faster)
    expect(fit.on).toBe(0)
    expect(fit.alarms).toBe(off.alarms)
  })

  it('is about twice as high if the code took the loss out with the wrong sign, so a change of sign fails here', () => {
    // Not a world: the correct term fitted, then applied as `x - b * heat`. Observed 0.37 against 0.18 right and 0.26 off.
    const { off, fit } = pair({ heat: HEAT })
    const flipped = silence({ heat: HEAT }, 'flipped')
    expect(flipped.alarms).toBeGreaterThan(fit.alarms * 1.8)
    expect(flipped.alarms).toBeGreaterThan(off.alarms * 1.3)
  })
})

describe('a device that reads the index off', () => {
  it.each([3, -3])('is no worse than without the term for a step of %i index degrees', (delta) => {
    for (const heat of [HEAT, CALM]) {
      const { off, fit } = pair({ heat: { ...heat, bias: { week: 80, delta } } })
      expect(fit.alarms, `b ${heat.b}`).toBeLessThanOrEqual(off.alarms + 0.02)
    }
  })
})

describe('a loss that stays', () => {
  /** The share of libraries that declare a 5% loss planted at week 60 within 26 weeks. */
  const seen = (spec: Base, mode: 'off' | 'fit', seeds = 100) => {
    let within = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const weeks = 130
      const planted: HeatSpec['planted'] = [{ type: 'step', week: 60, size: -0.05 }]
      const points = simulateHeat({ ...spec, weeks, perWeek: 3, planted }, seed)
      const records = replayHeat(points, weeks, mode === 'off' ? null : 'fit').records
      const found = firstWeekOf(records, 60, 'slipping')
      if (found !== null && found - 60 + 1 <= 26) within++
    }
    return within / seeds
  }

  it('is seen within 0.1 of the monitor without the term, and more often when the heat is taken out', () => {
    expect(seen({ heat: HEAT }, 'fit')).toBeGreaterThanOrEqual(seen({ heat: HEAT }, 'off') - 0.1)
    expect(seen({ heat: CALM }, 'fit')).toBeGreaterThanOrEqual(seen({ heat: CALM }, 'off') - 0.1)
  })
})

describe('the floors', () => {
  it('leaves a library of under two years exactly as the monitor reads it: the term is never on', () => {
    for (const years of [1, 1.5, 1.9]) {
      const { off, fit } = pair({ heat: HEAT }, years)
      expect(fit.on, `${years} years`).toBe(0)
      expect(fit.alarms, `${years} years`).toBe(off.alarms)
    }
    for (let seed = 1; seed <= 12; seed++) {
      const weeks = 98
      const points = simulateHeat({ weeks, perWeek: 3, heat: HEAT }, seed)
      expect(replayHeat(points, weeks, 'fit').records).toEqual(
        replayHeat(points, weeks, null).records,
      )
    }
  })

  it('reads exactly as the monitor does with no term: two runs in five with a temperature is not enough', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const weeks = 156
      const points = simulateHeat({ weeks, perWeek: 3, heat: { b: 0.03, coverage: 0.4 } }, seed)
      const run = replayHeat(points, weeks, 'fit')
      expect(run.term).toBeNull()
      expect(run.records).toEqual(replayHeat(points, weeks, null).records)
    }
  })
})

import { describe, expect, it, vi } from 'vitest'
import { replayHeat, simulateHeat } from './test/heatSim'
import type { HeatSpec } from './test/heatSim'
import { firstWeekOf, slipWeeks } from './test/runSim'

vi.setConfig({ testTimeout: 1_800_000 })

/**
 * The warm-day term on the run-level generator (D12 section 2.1): the silence budget with a planted heat response and
 * a season, the sign, a device that reads the index off, the lag to a planted loss, and coverage under the floor. Each
 * case runs with the term off (which is D2's monitor exactly: `null`) and fitted as the status fits it. The athlete
 * loses 3% of speed per 10 index degrees above 12, in a climate that swings 9 degrees about 14, and the file records
 * the index on every run unless a case says otherwise. Rates are steady runs a week; rows are three-year libraries.
 */
const RATES = [1.2, 2, 3, 5]
const YEARS = 3
type Base = Omit<HeatSpec, 'weeks' | 'perWeek'>
const HEAT = { b: 0.03, coverage: 1 }

/** Slip declarations an athlete-year where nothing changes in the athlete, and the share of libraries with the term on. */
function silence(spec: Base, mode: 'off' | 'fit' | 'flipped', libraries = 25) {
  let alarms = 0
  let on = 0
  for (const perWeek of RATES) {
    for (let seed = 1; seed <= libraries; seed++) {
      const weeks = YEARS * 52
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
  return { alarms: alarms / (n * YEARS), on: on / n }
}

describe('false alarms an athlete-year when nothing changes but the weather', () => {
  it('is under the budget with a heat response, where the monitor alone is over it', () => {
    const off = silence({ heat: HEAT }, 'off')
    const fitted = silence({ heat: HEAT }, 'fit')
    // Observed 0.26 off, 0.17 fitted, the term on in every library.
    expect(fitted.on).toBeGreaterThan(0.95)
    expect(off.alarms).toBeGreaterThan(0.2)
    expect(fitted.alarms).toBeLessThan(0.22)
    expect(fitted.alarms).toBeLessThan(off.alarms)
  })

  it('does not rise for an athlete the heat does not touch, though the term is on for a third of such libraries', () => {
    const calm = { heat: { b: 0, coverage: 1 } }
    const [off, fitted] = [silence(calm, 'off'), silence(calm, 'fit')]
    // Observed 0.17 off, 0.16 fitted, on in 33%.
    expect(fitted.on).toBeLessThan(0.5)
    expect(fitted.alarms).toBeLessThanOrEqual(off.alarms + 0.02)
  })

  it('stays under the budget of a season of 1.5%, whether the heat adds to the season or hides it', () => {
    const adds = { heat: HEAT, level: { seasonAmp: -0.015 } }
    const hides = { heat: HEAT, level: { seasonAmp: 0.015 } }
    const [addsOff, addsFit, hidesFit] = [
      silence(adds, 'off'),
      silence(adds, 'fit'),
      silence(hides, 'fit'),
    ]
    // Observed: the heat adding to the season 0.37 off -> 0.27 fitted; the heat hiding it 0.16 off -> 0.24 fitted.
    // The budget is that of episode.sim.test.ts for a season of 1.5% with no heat at all (0.32 here, 0.25 observed there).
    expect(addsFit.alarms).toBeLessThan(addsOff.alarms)
    expect(addsFit.alarms).toBeLessThan(0.32)
    expect(hidesFit.alarms).toBeLessThan(0.32)
  })

  it('stays under the budget of a 3% slow wander with the heat on top', () => {
    const spec = { heat: HEAT, level: { wanderSd: 0.03, wanderRho: 0.95 } }
    const [off, fitted] = [silence(spec, 'off'), silence(spec, 'fit')]
    // Observed 0.37 off, 0.35 fitted; the budget of a 3% wander is 0.4.
    expect(fitted.alarms).toBeLessThan(0.4)
    expect(fitted.alarms).toBeLessThanOrEqual(off.alarms + 0.02)
  })

  it('is about twice as high with the sign flipped, so a change of sign fails here', () => {
    const fitted = silence({ heat: HEAT }, 'fit')
    const flipped = silence({ heat: HEAT }, 'flipped')
    // Observed 0.17 and 0.38.
    expect(flipped.alarms).toBeGreaterThan(fitted.alarms * 1.8)
  })
})

describe('a device that reads the index off', () => {
  // Observed, off -> fitted: a step of +3 index degrees from week 80, 0.26 -> 0.15; of -3, 0.26 -> 0.20.
  it.each([3, -3])('is no worse than without the term for a step of %i index degrees', (delta) => {
    const spec = { heat: { ...HEAT, bias: { week: 80, delta } } }
    expect(silence(spec, 'fit').alarms).toBeLessThanOrEqual(silence(spec, 'off').alarms + 0.02)
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
    // Observed: with the heat 68% off -> 80% fitted; with no heat effect 88% -> 87%.
    expect(seen({ heat: HEAT }, 'fit')).toBeGreaterThanOrEqual(seen({ heat: HEAT }, 'off') - 0.1)
    const calm = { heat: { b: 0, coverage: 1 } }
    expect(seen(calm, 'fit')).toBeGreaterThanOrEqual(seen(calm, 'off') - 0.1)
  })
})

describe('coverage under the floor', () => {
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

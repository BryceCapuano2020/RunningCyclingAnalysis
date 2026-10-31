import { describe, expect, it, vi } from 'vitest'
import { NOISE_PRESETS } from '../synthetic/noise/presets'
import { firstWeekOf, quantile, replaySim, simulate, slipWeeks } from './test/runSim'
import type { SimSpec } from './test/runSim'

vi.setConfig({ testTimeout: 600_000 })

/**
 * The monitor on simulated run values (the unit's output, before any digest): the false-alarm budget
 * by nuisance, the lag to a planted loss, and recovery. Spreads are those measured on a real library
 * (3.8% a run, 2% wander); rates are steady runs a week. Budgets sit above what these seeds show, with room for another draw.
 */
const RATES = [1.2, 2, 3, 5]
const YEARS = 3

/** Slip declarations an athlete-year in libraries where nothing changes in the athlete, over the rates. */
function falseAlarms(spec: Partial<SimSpec>, libraries = 40): number {
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

describe('false alarms an athlete-year when nothing changes', () => {
  it('stays under 0.2 for an athlete with a slow wander and the odd bad run', () => {
    // Observed 0.16 over three years (0.24 before the episode work); the budget is a quarter of an alarm.
    expect(falseAlarms({})).toBeLessThan(0.2)
  })

  // Observed, over the four rates and three years (before -> now): wander 0.45 -> 0.31, season 1.5% 0.39 -> 0.25,
  // strap 0.31 -> 0.22, heat 0.26 -> 0.18, bad runs 0.21 -> 0.14, hilly 0.23 -> 0.16.
  it.each([
    [
      'a faster, slower wander (3%, correlation 0.95)',
      { level: { wanderSd: 0.03, wanderRho: 0.95 } },
      0.4,
    ],
    ['a season of 1.5% swing', { level: { seasonAmp: 0.015 } }, 0.32],
    ['a watch or strap change of 3%', { level: NOISE_PRESETS.strapStep.level }, 0.3],
    ['heat weeks of 3%', { level: { heatDrop: 0.03 } }, 0.25],
    ['10% of runs read wrong by the sensor', { bad: 0.1 }, 0.2],
    ['hilly runs, 30% of them 2% slow with wide spread', { hilly: 0.3 }, 0.22],
  ] as const)('stays under budget through %s', (_name, spec, budget) => {
    expect(falseAlarms(spec)).toBeLessThan(budget)
  })

  it('is near the budget with a 3% seasonal swing and with every nuisance at once, even in the first three years', () => {
    // Observed 0.40 for the season (0.66 before) and 0.34 for everything together (0.52). A season is only taken out
    // from the third year, so these three-year libraries are the hard case; episode.sim.test.ts runs five.
    expect(falseAlarms({ level: { seasonAmp: 0.03 } }, 20)).toBeLessThan(0.5)
    expect(
      falseAlarms({ level: NOISE_PRESETS.nuisanceAll.level, hilly: 0.3, bad: 0.1 }, 20),
    ).toBeLessThan(0.45)
  })
})

/** Weeks from the start of a change to the first declared slip (Infinity when never), over seeds. */
function lags(spec: SimSpec, seeds: number, from = 60): number[] {
  const out: number[] = []
  for (let seed = 1; seed <= seeds; seed++) {
    const found = firstWeekOf(replaySim(simulate(spec, seed), spec.weeks), from, 'slipping')
    out.push(found === null ? Number.POSITIVE_INFINITY : found - from + 1)
  }
  return out
}
const within = (xs: number[], weeks: number) => xs.filter((x) => x <= weeks).length / xs.length

describe('weeks to see a planted loss', () => {
  const step = (size: number, perWeek: number): SimSpec => ({
    weeks: 130,
    perWeek,
    planted: [{ type: 'step', week: 60, size }],
  })

  it('sees a drop of 8% in about 4 weeks at 3 runs a week and 5 at 1.2', () => {
    const fast = lags(step(-0.08, 3), 40)
    // Observed: median 4, 90% within 12 weeks (95% before the episode work); at 1.2 runs a week median 5, 85%.
    expect(quantile(fast, 0.5)).toBeLessThanOrEqual(5)
    expect(within(fast, 12)).toBeGreaterThanOrEqual(0.88)
    const thin = lags(step(-0.08, 1.2), 40)
    expect(quantile(thin, 0.5)).toBeLessThanOrEqual(6)
    expect(within(thin, 12)).toBeGreaterThanOrEqual(0.8)
  })

  it('sees a drop of 5% in 6 weeks at 3 runs a week, 80% of the time within 26', () => {
    const five = lags(step(-0.05, 3), 40)
    // Observed: median 7, 87% within 26 weeks (median 7, 95% before: the second qualifying week and the check against the year before cost a few detections).
    expect(quantile(five, 0.5)).toBeLessThanOrEqual(7)
    expect(within(five, 26)).toBeGreaterThanOrEqual(0.83)
  })

  it('does not claim to see 3%: about half are seen within half a year', () => {
    const three = lags(step(-0.03, 3), 40)
    // Observed 55% within 26 weeks: below the athlete's own spread, so no claim.
    expect(within(three, 26)).toBeLessThan(0.7)
  })

  it('sees a slide to 8% over 12 weeks about when it reaches 6 to 7%, and over 26 weeks within the half-year', () => {
    const quick = lags(
      { weeks: 130, perWeek: 3, planted: [{ type: 'ramp', week: 60, size: -0.08, weeks: 12 }] },
      40,
    )
    expect(quantile(quick, 0.5)).toBeGreaterThanOrEqual(9)
    // Observed: median 12, 98% within 26 weeks; a slide over 26 weeks 88% within 30.
    expect(within(quick, 26)).toBeGreaterThanOrEqual(0.95)
    const slow = lags(
      { weeks: 130, perWeek: 3, planted: [{ type: 'ramp', week: 60, size: -0.08, weeks: 26 }] },
      40,
    )
    expect(within(slow, 30)).toBeGreaterThanOrEqual(0.75)
  })
})

describe('recovery', () => {
  const dip = (back: number, rampWeeks?: number): SimSpec => ({
    weeks: 210,
    perWeek: 3,
    planted: [
      { type: 'step', week: 60, size: -0.08 },
      rampWeeks === undefined
        ? { type: 'step', week: 100, size: back }
        : { type: 'ramp', week: 100, size: back, weeks: rampWeeks },
    ],
  })

  /** After the slip: weeks from week 100 to "recovering" and to "back", and how many said so before the return. */
  function after(spec: SimSpec, seeds: number) {
    const recovering: number[] = []
    const back: number[] = []
    let early = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const records = replaySim(simulate(spec, seed), spec.weeks)
      const slip = firstWeekOf(records, 60, 'slipping')
      if (slip === null) continue
      const r = firstWeekOf(records, slip, 'recovering')
      const b = firstWeekOf(records, slip, 'back')
      if (r !== null && r < 100) early++
      else recovering.push(r === null ? Number.POSITIVE_INFINITY : r - 100)
      back.push(b === null || b < 100 ? Number.POSITIVE_INFINITY : b - 100)
    }
    return { recovering, back, early }
  }

  it('confirms an abrupt return as recovering within weeks and back within a year', () => {
    const result = after(dip(0.08), 40)
    // Observed: median 7 weeks, 89% within 20 and 95% within 52; back 72% within 52 and 87% within 100 (92% before: the rest close as holding, level with the old range); 1 in 40 early.
    expect(quantile(result.recovering, 0.5)).toBeLessThanOrEqual(9)
    expect(within(result.recovering, 52)).toBeGreaterThanOrEqual(0.9)
    expect(within(result.back, 52)).toBeGreaterThanOrEqual(0.65)
    expect(result.early).toBeLessThanOrEqual(3)
  })

  it('takes longer, and says so later, for a return spread over half a year', () => {
    const result = after(dip(0.08, 26), 40)
    const abrupt = after(dip(0.08), 40)
    expect(quantile(result.recovering, 0.5)).toBeGreaterThan(quantile(abrupt.recovering, 0.5))
    // Observed: median 22 weeks, 92% within 52.
    expect(within(result.recovering, 52)).toBeGreaterThanOrEqual(0.85)
  })

  it('does not call a return back that stays short of the old level by more than the tolerance', () => {
    const result = after({ ...dip(0.03) }, 40)
    // Observed 8%: a return of 3% against a loss of 8% stays 5% short.
    expect(within(result.back, 100)).toBeLessThanOrEqual(0.15)
  })

  it('rarely says recovering or back when the level stays down: 10% within a year, 20% within 2.5 years', () => {
    // Shown states, as the athlete sees them: a state has to hold for two weekly evaluations.
    const seeds = 60
    let year = 0
    let long = 0
    let backs = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const spec: SimSpec = {
        weeks: 200,
        perWeek: 3,
        bad: 0.03,
        planted: [{ type: 'step', week: 60, size: -0.08 }],
      }
      const records = replaySim(simulate(spec, seed), spec.weeks)
      const slip = firstWeekOf(records, 55, 'slipping')!
      const rec = records.find((r) => r.w >= slip && r.shown === 'recovering')
      if (rec !== undefined && rec.w - slip < 52) year++
      if (rec !== undefined && rec.w - slip < 130) long++
      if (records.some((r) => r.w >= slip && r.state === 'back')) backs++
    }
    // Observed on 200 libraries: 3% within a year, 8% within 2.5 years; back 1%.
    expect(year / seeds).toBeLessThanOrEqual(0.1)
    expect(long / seeds).toBeLessThanOrEqual(0.2)
    expect(backs / seeds).toBeLessThanOrEqual(0.05)
  })
})

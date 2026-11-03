// The ride threshold on simulated riders with a known threshold (harness: test/simRider.ts): is the estimate right on
// average, does a bad heart rate move it, and how often does its range hold the truth? The range is wider than an 80%
// interval (most cells read about 96%), so the bound is a band, not 80%. The table in docs/design/threshold.md is this run
// (RECORD=1 prints it).
import { describe, expect, it } from 'vitest'
import { rideThreshold } from './estimate'
import { simRiders, type Scenario } from './test/simRider'

/** Riders per case. At 1,200 the within-5% share of the maximum-heart-rate case ranged 82% to 85% across four seeds. */
const RIDERS = 1200
const SEED = 11

/** One answer judged against the truth, over all the riders of a case. */
interface Arm {
  /** Error against the true threshold, in percent, one entry per rider. */
  errors: number[]
  /** How many riders had their true threshold between the answer's low and high. */
  covered: number
}

interface Row {
  estimate: Arm
  /** The same riders with no heart rate passed: the power estimate itself. */
  powerOnly: Arm
  best30: number[]
  rule95: number[]
  /** How many riders got no heart-rate estimate, by reason. */
  refused: Map<string, number>
  /** How many riders got an answer under the one without heart rate. */
  lowered: number
}

function run(scenario: Scenario): Row {
  const row: Row = {
    estimate: { errors: [], covered: 0 },
    powerOnly: { errors: [], covered: 0 },
    best30: [],
    rule95: [],
    refused: new Map(),
    lowered: 0,
  }
  for (const rider of simRiders(scenario, RIDERS, SEED)) {
    const error = (value: number) => (value / rider.threshold - 1) * 100
    const best = (s: number) =>
      Math.max(...rider.efforts.filter((e) => e.durationS === s).map((e) => e.value))
    const judge = (arm: Arm, result: { value: number; low: number; high: number }) => {
      arm.errors.push(error(result.value))
      if (result.low <= rider.threshold && rider.threshold <= result.high) arm.covered++
    }
    const result = rideThreshold(rider.efforts, rider.blocks, rider.thresholdHr)!
    judge(row.estimate, result)
    const alone = rideThreshold(rider.efforts, [], null)!
    judge(row.powerOnly, alone)
    if (result.value < alone.value) row.lowered++
    row.best30.push(error(best(1800)))
    row.rule95.push(error(0.95 * best(1200)))
    if ('refused' in result.heartRate) {
      const why = result.heartRate.refused
      row.refused.set(why, (row.refused.get(why) ?? 0) + 1)
    }
  }
  return row
}

const median = (errors: number[]) => [...errors].sort((a, b) => a - b)[errors.length >> 1]!
const within5 = (errors: number[]) => errors.filter((e) => Math.abs(e) <= 5).length / errors.length
const coverage = (arm: Arm) => arm.covered / arm.errors.length
const refusedShare = (row: Row) =>
  [...row.refused.values()].reduce((total, n) => total + n, 0) / RIDERS

const clean: Scenario = { name: 'clean heart rate' }
const strap: Scenario = { name: 'a bad strap on 1 ride in 4', faults: true }
const maximum: Scenario = { name: 'maximum heart rate off by about 8 bpm', referenceError: 8 }
const optical: Scenario = { name: 'flat optical heart rate', flat: true }
const tempo: Scenario = { name: 'never all out (tempo only)', tempoOnly: true }
const none: Scenario = { name: 'no heart rate', noHeartRate: true }
const allOut: Scenario = { name: 'always all out', allOut: true }
const allOutNone: Scenario = {
  name: 'always all out, no heart rate',
  allOut: true,
  noHeartRate: true,
}

const ALL = [clean, strap, maximum, optical, tempo, none, allOut, allOutNone]

// Run on first use, inside a test, so the 180 s test timeout applies and not the hook's 10 s.
const rows = new Map<Scenario, Row>()
const of = (s: Scenario) => rows.get(s) ?? rows.set(s, run(s)).get(s)!

describe('the ride threshold on simulated riders', () => {
  it('is within 3% on the median and within 5% for most riders with a clean heart rate', () => {
    expect(Math.abs(median(of(clean).estimate.errors))).toBeLessThan(3)
    expect(within5(of(clean).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  it('stays within 5% for most riders when 1 ride in 4 has a bad strap', () => {
    expect(within5(of(strap).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  it('stays within 5% for most riders when the maximum heart rate is off by about 8 bpm', () => {
    expect(within5(of(maximum).estimate.errors)).toBeGreaterThanOrEqual(0.65)
  })

  it('stays within 5% for most riders with an optical heart rate that barely moves', () => {
    expect(within5(of(optical).estimate.errors)).toBeGreaterThanOrEqual(0.7)
  })

  it('lifts a rider who never goes all out at least 7 points above the power-only answer', () => {
    const { estimate, powerOnly } = of(tempo)
    expect(median(estimate.errors)).toBeGreaterThanOrEqual(-7)
    expect(median(estimate.errors) - median(powerOnly.errors)).toBeGreaterThanOrEqual(7)
  })

  // With no heart rate the answer is what the bests show, and these riders' bests sit a few percent under all-out, so it reads
  // low by about that: an allowance for it (the median from power alone, about 3% up) was dropped as unconfirmed.
  it('reads at most 4% low on the median and within 5% for most riders with no heart rate', () => {
    expect(median(of(none).estimate.errors)).toBeGreaterThan(-4)
    expect(median(of(none).estimate.errors)).toBeLessThanOrEqual(0)
    expect(within5(of(none).estimate.errors)).toBeGreaterThanOrEqual(0.75)
  })

  it('is nearer the truth than the old floor (best 30 min) and 95% of the best 20 min in every case', () => {
    for (const scenario of ALL) {
      const row = of(scenario)
      const miss = (errors: number[]) => Math.abs(median(errors))
      const { errors } = row.estimate
      expect(miss(errors), scenario.name).toBeLessThan(miss(row.best30))
      expect(miss(errors), scenario.name).toBeLessThan(miss(row.rule95))
      expect(within5(errors), scenario.name).toBeGreaterThan(within5(row.best30))
      expect(within5(errors), scenario.name).toBeGreaterThan(within5(row.rule95))
    }
  })

  it('holds the true threshold between its low and high for 65% to 97% of riders in every case', () => {
    for (const scenario of ALL) {
      const share = coverage(of(scenario).estimate)
      expect.soft(share, scenario.name).toBeGreaterThanOrEqual(0.65)
      expect.soft(share, scenario.name).toBeLessThanOrEqual(0.97)
    }
  })

  // The rider the allowance read high: bests that are a ceiling. Without heart rate the answer is what they show; heart rate
  // reads with noise and can only lift, so with it the answer may sit a little over.
  it('reads a rider who always goes all out within 1% on the median, and at most 2% high with heart rate', () => {
    expect(Math.abs(median(of(allOutNone).estimate.errors))).toBeLessThan(1)
    expect(within5(of(allOutNone).estimate.errors)).toBeGreaterThanOrEqual(0.85)
    expect(median(of(allOut).estimate.errors)).toBeLessThanOrEqual(2)
    expect(within5(of(allOut).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  it('never answers under the answer without heart rate', () => {
    for (const scenario of ALL) expect(of(scenario).lowered, scenario.name).toBe(0)
  })

  it('refuses the heart-rate line for few riders whose strap works', () => {
    expect(refusedShare(of(clean))).toBeLessThan(0.02)
  })

  // A wrong maximum heart rate shifts every heart-rate estimate at once and has a bound of its own above. These three are the
  // cases where the reference is right and heart rate is sound, wrong on some rides, or flat. Power alone reads these riders a
  // few percent low, so a sound heart rate should gain them a clear share, and a flat one, mostly refused, cost nothing much.
  it('gains at least 5 points of within-5% over power alone with a clean or partly bad heart rate', () => {
    for (const scenario of [clean, strap]) {
      const row = of(scenario)
      const gain = within5(row.estimate.errors) - within5(row.powerOnly.errors)
      expect.soft(gain, scenario.name).toBeGreaterThanOrEqual(0.05)
    }
  })

  it('costs at most 3 points of within-5% against power alone with an optical heart rate', () => {
    const row = of(optical)
    expect(within5(row.powerOnly.errors) - within5(row.estimate.errors)).toBeLessThanOrEqual(0.03)
  })
})

// RECORD=1 prints the rows of the table in docs/design/threshold.md: the median error, share within 5% and the share whose
// range holds the truth, for the answer and for power alone.
const recording = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env.RECORD
describe('the table of docs/design/threshold.md', () => {
  it.skipIf(recording === undefined)('prints its rows', () => {
    const pct = (x: number) => `${Math.round(100 * x)}%`
    const sign = (x: number) => `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(1)}%`
    const cell = (arm: Arm) =>
      `${sign(median(arm.errors))}, ${pct(within5(arm.errors))}, ${pct(coverage(arm))}`
    const lines = ALL.map((scenario) => {
      const row = of(scenario)
      const old = (errors: number[]) => `${sign(median(errors))}, ${pct(within5(errors))}`
      const why = [...row.refused].map(([reason, n]) => `${reason} ${n}`).join(', ')
      return `| ${scenario.name} | ${cell(row.estimate)} | ${cell(row.powerOnly)} | ${old(row.best30)} | ${old(row.rule95)} | refused ${pct(refusedShare(row))} (${why}) |`
    })
    console.log(`RECORDED\n${lines.join('\n')}`)
  })
})

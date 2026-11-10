// The ride threshold on simulated riders with a known threshold (harness: test/simRider.ts): is the estimate right on
// average, does a bad heart rate move it, and how often does its range hold the truth? The range is wider than an 80%
// interval (most cells read about 96%), so the bound is a band, not 80%. The table in docs/design/threshold.md is this run
// (RECORD=1 prints it).
import { describe, expect, it } from 'vitest'
import { rideThreshold } from './estimate'
import { RIDER, type Scenario } from './test/simRider'
import {
  bestAt,
  coverage,
  median,
  refusedShare,
  runCase,
  tableLine,
  within5,
  type Row,
} from './test/simRows'

/** Riders per case. At 1,200 the within-5% share of the maximum-heart-rate case ranged 82% to 85% across four seeds. */
const RIDERS = 1200
const SEED = 11

const run = (scenario: Scenario): Row =>
  runCase(scenario, RIDER, RIDERS, SEED, rideThreshold, {
    'best 30 min': (rider) => bestAt(rider, 1800),
    '95% of best 20 min': (rider) => 0.95 * bestAt(rider, 1200),
  })

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

// A shallow line, its climb near the 20 bpm floor, where each beat is the most watts: some riders are refused, and those that
// are not have the least sure slide to threshold heart rate. With a wrong maximum too, that slide went most often too far.
const nearFloor: Scenario = { name: 'heart rate climbing only 18 to 24 bpm', climb: [18, 24] }
const nearFloorMaximum: Scenario = {
  name: 'climbing 18 to 24 bpm, maximum off by about 8 bpm',
  climb: [18, 24],
  referenceError: 8,
}

const ALL = [
  clean,
  strap,
  maximum,
  optical,
  tempo,
  none,
  allOut,
  allOutNone,
  nearFloor,
  nearFloorMaximum,
]

// Run on first use, inside a test, so the 180 s test timeout applies and not the hook's 10 s.
const rows = new Map<Scenario, Row>()
const of = (s: Scenario) => rows.get(s) ?? rows.set(s, run(s)).get(s)!
const rule = (row: Row, name: string) => row.rules.get(name)!

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

  // The hour a tempo rider rode is a floor under the power-only answer, which took it from 13.5% low to 11.7%, so heart rate has
  // less left to lift: 8.3 points before the floor, 6.6 after, 6.4 since heart rate's weight (near the flat floor, and the
  // chance it is sound) trims its lift.
  it('lifts a rider who never goes all out at least 6 points above the power-only answer', () => {
    const { estimate, powerOnly } = of(tempo)
    expect(median(estimate.errors)).toBeGreaterThanOrEqual(-7)
    expect(median(estimate.errors) - median(powerOnly.errors)).toBeGreaterThanOrEqual(6)
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
      for (const name of row.rules.keys()) {
        expect(miss(errors), `${scenario.name}: ${name}`).toBeLessThan(miss(rule(row, name)))
        expect(within5(errors), `${scenario.name}: ${name}`).toBeGreaterThan(
          within5(rule(row, name)),
        )
      }
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

  // Before heart rate faded in above the floor, 7.5% of the riders with a wrong maximum read over 10% high (seed 11).
  it('keeps a line near the flat floor from lifting the answer far, and costs little against power alone', () => {
    const over = (errors: number[], share: number) =>
      errors.filter((e) => e > share).length / errors.length
    for (const scenario of [nearFloor, nearFloorMaximum]) {
      const row = of(scenario)
      expect.soft(over(row.estimate.errors, 10), scenario.name).toBeLessThan(0.02)
      expect
        .soft(within5(row.powerOnly.errors) - within5(row.estimate.errors), scenario.name)
        .toBeLessThanOrEqual(0.02)
    }
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
    console.log(
      `RECORDED\n${ALL.map((scenario) => tableLine(scenario.name, of(scenario))).join('\n')}`,
    )
  })
})

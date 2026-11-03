// The run threshold on simulated runners with a known 1-hour pace (harness: test/simRider.ts and test/simRows.ts, shared with
// the ride simulation): their efforts are drawn from Daniels and Gilbert's curve with an endurance tilt of their own, a
// sprinter's or a diesel's. The table in docs/design/threshold.md ("Runs") is this run (RECORD=1 prints it).
import { describe, expect, it } from 'vitest'
import { fitCriticalPower } from '../cp'
import { runThreshold } from './estimate'
import { RUNNER, type Scenario, type SimRider } from './test/simRider'
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

const RUNNERS = 1200
const SEED = 11

/** The fit this threshold replaces: critical speed over the best 3 to 20 min, which reads a 10K pace. */
function criticalSpeed(rider: SimRider): number {
  const curve = [180, 300, 480, 600, 900, 1200].map((durationS) => ({
    durationS,
    value: bestAt(rider, durationS),
    activityId: null,
    startIndex: -1,
    windowS: null,
  }))
  return fitCriticalPower(curve)?.cp ?? bestAt(rider, 1200)
}

const run = (scenario: Scenario): Row =>
  runCase(scenario, RUNNER, RUNNERS, SEED, runThreshold, {
    'critical speed': criticalSpeed,
    'best 30 min': (rider) => bestAt(rider, 1800),
  })

const clean: Scenario = { name: 'clean heart rate' }
const strap: Scenario = { name: 'a bad strap on 1 run in 4', faults: true }
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

// Runners differ from Daniels and Gilbert's curve by more or less than the riders from the ride table: twice as much.
const wide: Scenario = { name: 'endurance varying twice as much', enduranceSpread: 2 }
const wideNone: Scenario = {
  name: 'twice as much, no heart rate',
  enduranceSpread: 2,
  noHeartRate: true,
}

const USUAL = [clean, strap, maximum, optical, tempo, none, allOut, allOutNone]
const ALL = [...USUAL, wide, wideNone]

// Run on first use, inside a test, so the test timeout applies and not the hook's.
const rows = new Map<Scenario, Row>()
const of = (s: Scenario) => rows.get(s) ?? rows.set(s, run(s)).get(s)!

const rule = (row: Row, name: string) => row.rules.get(name)!

describe('the run threshold on simulated runners', () => {
  it('is within 3% on the median and within 5% for most runners with a clean heart rate', () => {
    expect(Math.abs(median(of(clean).estimate.errors))).toBeLessThan(3)
    expect(within5(of(clean).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  it('stays within 5% for most runners when 1 run in 4 has a bad strap', () => {
    expect(within5(of(strap).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  it('stays within 5% for most runners when the maximum heart rate is off by about 8 bpm', () => {
    expect(within5(of(maximum).estimate.errors)).toBeGreaterThanOrEqual(0.65)
  })

  it('stays within 5% for most runners with an optical heart rate that barely moves', () => {
    expect(within5(of(optical).estimate.errors)).toBeGreaterThanOrEqual(0.7)
  })

  it('lifts a runner who never goes all out at least 5 points above the power-only answer', () => {
    const { estimate, powerOnly } = of(tempo)
    expect(median(estimate.errors)).toBeGreaterThanOrEqual(-7)
    expect(median(estimate.errors) - median(powerOnly.errors)).toBeGreaterThanOrEqual(5)
  })

  // With no heart rate the answer is what the bests show, and these runners' bests sit a few percent under all-out.
  it('reads at most 4% low on the median and within 5% for most runners with no heart rate', () => {
    expect(median(of(none).estimate.errors)).toBeGreaterThan(-4)
    expect(median(of(none).estimate.errors)).toBeLessThanOrEqual(0)
    expect(within5(of(none).estimate.errors)).toBeGreaterThanOrEqual(0.75)
  })

  // Critical speed over the 3 to 20 min bests reads about 2% over an hour for a runner who gives it all (a 40 min pace, about a
  // 10K race), so with bests 0 to 7% short its error happens to sit near zero on the median; what it lacks is the share of
  // runners it reads within 5%.
  it('reads more runners within 5% than critical speed and the best 30 min in every usual case', () => {
    for (const scenario of USUAL) {
      const row = of(scenario)
      const { errors } = row.estimate
      expect(within5(errors), `${scenario.name}: critical speed`).toBeGreaterThan(
        within5(rule(row, 'critical speed')),
      )
      expect(within5(errors), `${scenario.name}: best 30 min`).toBeGreaterThan(
        within5(rule(row, 'best 30 min')),
      )
      expect(Math.abs(median(errors)), `${scenario.name}: best 30 min`).toBeLessThan(
        Math.abs(median(rule(row, 'best 30 min'))),
      )
    }
  })

  it('reads a runner who always goes all out nearer the hour pace than critical speed does', () => {
    for (const scenario of [allOut, allOutNone]) {
      const row = of(scenario)
      expect(Math.abs(median(row.estimate.errors)), scenario.name).toBeLessThan(
        Math.abs(median(rule(row, 'critical speed'))),
      )
    }
    expect(median(rule(of(allOutNone), 'critical speed'))).toBeGreaterThan(1.5)
  })

  it('holds the true threshold between its low and high for 65% to 97% of runners in every case', () => {
    for (const scenario of ALL) {
      const share = coverage(of(scenario).estimate)
      expect.soft(share, scenario.name).toBeGreaterThanOrEqual(0.65)
      expect.soft(share, scenario.name).toBeLessThanOrEqual(0.97)
    }
  })

  it('reads a runner who always goes all out within 1% on the median, and at most 2% high with heart rate', () => {
    expect(Math.abs(median(of(allOutNone).estimate.errors))).toBeLessThan(1)
    expect(within5(of(allOutNone).estimate.errors)).toBeGreaterThanOrEqual(0.85)
    expect(median(of(allOut).estimate.errors)).toBeLessThanOrEqual(2)
    expect(within5(of(allOut).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  // The ratio's spread between runners is the riders'. Runners twice as far from the curve widen the error, not the range's hold.
  it('stays within 5% for most runners whose endurance varies twice as much, with or without heart rate', () => {
    expect(within5(of(wide).estimate.errors)).toBeGreaterThanOrEqual(0.75)
    expect(within5(of(wideNone).estimate.errors)).toBeGreaterThanOrEqual(0.65)
    expect(Math.abs(median(of(wide).estimate.errors))).toBeLessThan(3)
  })

  it('never answers under the answer without heart rate', () => {
    for (const scenario of ALL) expect(of(scenario).lowered, scenario.name).toBe(0)
  })

  it('refuses the heart-rate line for few runners whose strap works', () => {
    expect(refusedShare(of(clean))).toBeLessThan(0.02)
  })

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
describe('the table of docs/design/threshold.md (runs)', () => {
  it.skipIf(recording === undefined)('prints its rows', () => {
    console.log(
      `RECORDED\n${ALL.map((scenario) => tableLine(scenario.name, of(scenario))).join('\n')}`,
    )
  })
})

// The ride threshold on simulated riders with a known threshold (harness: test/simRider.ts): is the estimate right on
// average, and does a bad heart rate move it? The table in docs/design/threshold.md is this run.
import { describe, expect, it } from 'vitest'
import { rideThreshold } from './estimate'
import { simRiders, type Scenario } from './test/simRider'

/**
 * Riders per case. At 400 the within-5% share of the maximum-heart-rate case ranged 66% to 77% across six seeds; at
 * 1,200 it ranged 71% to 73% across four.
 */
const RIDERS = 1200
const SEED = 11

interface Row {
  /** Error against the true threshold, in percent, of each arm, one entry per rider. */
  estimate: number[]
  powerOnly: number[]
  best30: number[]
  rule95: number[]
  ranges: boolean
}

function run(scenario: Scenario): Row {
  const row: Row = { estimate: [], powerOnly: [], best30: [], rule95: [], ranges: true }
  for (const rider of simRiders(scenario, RIDERS, SEED)) {
    const error = (value: number) => (value / rider.threshold - 1) * 100
    const best = (s: number) =>
      Math.max(...rider.efforts.filter((e) => e.durationS === s).map((e) => e.value))
    const result = rideThreshold(rider.efforts, rider.blocks, rider.thresholdHr)!
    row.estimate.push(error(result.value))
    row.powerOnly.push(error(rideThreshold(rider.efforts, [], null)!.value))
    row.best30.push(error(best(1800)))
    row.rule95.push(error(0.95 * best(1200)))
    row.ranges &&= result.low <= result.value && result.value <= result.high
  }
  return row
}

const median = (errors: number[]) => [...errors].sort((a, b) => a - b)[errors.length >> 1]!
const within5 = (errors: number[]) => errors.filter((e) => Math.abs(e) <= 5).length / errors.length

const clean: Scenario = { name: 'clean heart rate' }
const strap: Scenario = { name: 'a bad strap on 1 ride in 4', faults: true }
const maximum: Scenario = { name: 'maximum heart rate off by about 8 bpm', referenceError: 8 }
const optical: Scenario = { name: 'flat optical heart rate', flat: true }
const tempo: Scenario = { name: 'never all out (tempo only)', tempoOnly: true }
const none: Scenario = { name: 'no heart rate', noHeartRate: true }

const ALL = [clean, strap, maximum, optical, tempo, none]

describe('the ride threshold on simulated riders', () => {
  // Run on first use, inside a test, so the 180 s test timeout applies and not the hook's 10 s.
  const rows = new Map<Scenario, Row>()
  const of = (s: Scenario) => rows.get(s) ?? rows.set(s, run(s)).get(s)!

  it('is within 3% on the median and within 5% for most riders with a clean heart rate', () => {
    expect(Math.abs(median(of(clean).estimate))).toBeLessThan(3)
    expect(within5(of(clean).estimate)).toBeGreaterThanOrEqual(0.85)
  })

  it('stays within 5% for most riders when 1 ride in 4 has a bad strap', () => {
    expect(within5(of(strap).estimate)).toBeGreaterThanOrEqual(0.85)
  })

  it('stays within 5% for most riders when the maximum heart rate is off by about 8 bpm', () => {
    expect(within5(of(maximum).estimate)).toBeGreaterThanOrEqual(0.65)
  })

  it('stays within 5% for most riders with an optical heart rate that barely moves', () => {
    expect(within5(of(optical).estimate)).toBeGreaterThanOrEqual(0.7)
  })

  it('lifts a rider who never goes all out at least 4 points above the power-only answer', () => {
    const { estimate, powerOnly } = of(tempo)
    expect(median(estimate)).toBeGreaterThanOrEqual(-7)
    expect(median(estimate) - median(powerOnly)).toBeGreaterThanOrEqual(4)
  })

  it('is within 2% on the median and within 5% for most riders with no heart rate', () => {
    expect(Math.abs(median(of(none).estimate))).toBeLessThan(2)
    expect(within5(of(none).estimate)).toBeGreaterThanOrEqual(0.85)
  })

  it('is nearer the truth than the old floor (best 30 min) and 95% of the best 20 min in every case', () => {
    for (const scenario of ALL) {
      const row = of(scenario)
      const miss = (errors: number[]) => Math.abs(median(errors))
      expect(miss(row.estimate), scenario.name).toBeLessThan(miss(row.best30))
      expect(miss(row.estimate), scenario.name).toBeLessThan(miss(row.rule95))
      expect(within5(row.estimate), scenario.name).toBeGreaterThan(within5(row.best30))
      expect(within5(row.estimate), scenario.name).toBeGreaterThan(within5(row.rule95))
    }
  })

  it('always puts its answer inside its range', () => {
    for (const scenario of ALL) expect(of(scenario).ranges, scenario.name).toBe(true)
  })
})

// The run threshold on simulated runners with a known 1-hour pace (harness: test/simRider.ts and test/simRows.ts, shared with
// the ride simulation): their efforts are drawn from Daniels and Gilbert's curve, through speed as the estimate reads it, with an
// endurance tilt of their own, a sprinter's or a diesel's. A run's threshold reads pace alone (docs/design/threshold.md,
// "Runs"), so no case has heart rate. The table in that note is this run (RECORD=1 prints it).
import { describe, expect, it } from 'vitest'
import { fitCriticalPower } from '../cp'
import { DURATION_TABLES } from './durationTables'
import { runThreshold, thresholdOver } from './estimate'
import { RUNNER, type Scenario, type SimRider } from './test/simRider'
import { bestAt, coverage, median, runCase, tableLine, within5, type Row } from './test/simRows'

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

/** The run table as it was, reading bests from 3 min: what the estimate would say if short training bests counted. */
const FROM_3_MIN = { ...DURATION_TABLES.run, shortestS: 180 }

// The estimate as the analysis calls it for runs: efforts alone, no heart rate.
const run = (scenario: Scenario): Row =>
  runCase(scenario, RUNNER, RUNNERS, SEED, (efforts) => runThreshold(efforts, [], null), {
    'critical speed': criticalSpeed,
    'best 30 min': (rider) => bestAt(rider, 1800),
    'from 3 min': (rider) => thresholdOver(FROM_3_MIN, rider.efforts, [], null)!.value,
  })

const usual: Scenario = { name: 'hard runs 0 to 7% short of all out', noHeartRate: true }
const allOut: Scenario = { name: 'always all out', allOut: true, noHeartRate: true }
const tempo: Scenario = { name: 'never all out (tempo only)', tempoOnly: true, noHeartRate: true }
// Runners differ from Daniels and Gilbert's curve by more or less than the riders from the ride table: twice as much.
const wide: Scenario = {
  name: 'endurance varying twice as much',
  enduranceSpread: 2,
  noHeartRate: true,
}
const wideAllOut: Scenario = {
  name: 'twice as much, always all out',
  enduranceSpread: 2,
  allOut: true,
  noHeartRate: true,
}

// Bursts in the short bests of training runs (strides, hills, GPS noise): 3% to 6% over the curve on about half the runs.
const fastShort: Scenario = {
  name: 'strides: short bests 3% to 6% over',
  shortBias: 0.06,
  noHeartRate: true,
}

const ALL = [usual, allOut, tempo, wide, wideAllOut, fastShort]

// Run on first use, inside a test, so the test timeout applies and not the hook's.
const rows = new Map<Scenario, Row>()
const of = (s: Scenario) => rows.get(s) ?? rows.set(s, run(s)).get(s)!

const rule = (row: Row, name: string) => row.rules.get(name)!

describe('the run threshold on simulated runners', () => {
  // The bests of these runners sit a few percent under all-out, so the answer reads a little low. Runs read from 8 min: the 3 and
  // 5 min bests of a hard run are left out, which costs the runners whose only hard runs are that short a few points of this share.
  it('reads at most 4% low on the median and within 5% for most runners whose hard runs fall short', () => {
    expect(median(of(usual).estimate.errors)).toBeGreaterThan(-4)
    expect(median(of(usual).estimate.errors)).toBeLessThanOrEqual(0)
    expect(within5(of(usual).estimate.errors)).toBeGreaterThanOrEqual(0.65)
  })

  it('reads a runner who always goes all out within 1% on the median and 85% of them within 5%', () => {
    expect(Math.abs(median(of(allOut).estimate.errors))).toBeLessThan(1)
    expect(within5(of(allOut).estimate.errors)).toBeGreaterThanOrEqual(0.85)
  })

  // Critical speed over the 3 to 20 min bests reads the pace of about 40 min, so a runner who gives it all is read a little fast and
  // one 0 to 7% short close to the truth on the median, the two errors cancelling; what it lacks is the share read within 5%.
  it('reads more runners within 5% than critical speed and the best 30 min, and nearer the truth than the best 30 min', () => {
    for (const scenario of [usual, allOut, wide, wideAllOut]) {
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

  it('holds the true threshold between its low and high for 65% to 97% of runners in every case', () => {
    for (const scenario of ALL) {
      const share = coverage(of(scenario).estimate)
      expect.soft(share, scenario.name).toBeGreaterThanOrEqual(0.65)
      expect.soft(share, scenario.name).toBeLessThanOrEqual(0.97)
    }
  })

  // The ratio's spread between runners is the riders'. Runners twice as far from the curve widen the error, not the range's hold.
  it('stays within 5% for most runners whose endurance varies twice as much', () => {
    expect(within5(of(wide).estimate.errors)).toBeGreaterThanOrEqual(0.6)
    expect(Math.abs(median(of(wide).estimate.errors))).toBeLessThan(4)
    expect(within5(of(wideAllOut).estimate.errors)).toBeGreaterThanOrEqual(0.8)
    expect(Math.abs(median(of(wideAllOut).estimate.errors))).toBeLessThan(1)
  })

  // The reason runs read from 8 min: a burst in the short bests of training runs (strides, hills, GPS noise) does not describe the
  // hour. The answer does not move for them; read from 3 min, the same runners would be read well over their threshold.
  it('is not moved by strides in the short bests of training runs, which would lift the answer from 3 min', () => {
    const strides = of(fastShort)
    expect(
      Math.abs(median(strides.estimate.errors) - median(of(usual).estimate.errors)),
    ).toBeLessThan(1)
    expect(within5(strides.estimate.errors)).toBeGreaterThanOrEqual(0.6)
    const from3 = rule(strides, 'from 3 min')
    expect(median(from3) - median(rule(of(usual), 'from 3 min'))).toBeGreaterThan(5)
    expect(median(from3)).toBeGreaterThan(3)
  })

  // With no heart rate to confirm a rise, a runner who never goes all out is read from bests well under what they can do. Heart rate
  // lifted such a runner on this simulation and read a real library far too fast, so runs do not use it; this is what that costs.
  it('reads a runner who never goes all out 8% to 14% low, and none of them within 5%', () => {
    const { errors } = of(tempo).estimate
    expect(median(errors)).toBeLessThan(-8)
    expect(median(errors)).toBeGreaterThan(-14)
    expect(within5(errors)).toBeLessThan(0.02)
  })
})

// RECORD=1 prints the rows of the table in docs/design/threshold.md: the median error, share within 5% and the share whose
// range holds the truth for the answer, then the median error and share within 5% of each rule of thumb.
const recording = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env.RECORD
describe('the table of docs/design/threshold.md (runs)', () => {
  it.skipIf(recording === undefined)('prints its rows', () => {
    console.log(
      `RECORDED\n${ALL.map((scenario) => tableLine(scenario.name, of(scenario), false)).join('\n')}`,
    )
  })
})

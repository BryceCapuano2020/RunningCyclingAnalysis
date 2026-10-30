import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { fitnessLines } from './fitness'
import { lintCopy } from './findings/copy'
import { AnalysisSession } from './session'
import {
  SAMPLE_CLOCK,
  SAMPLE_REFERENCE_NOW_MS,
  easySlipOn,
  easyWobbleOn,
  samplePlan,
} from './synthetic'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const SETTINGS = { massKg: 75, bikeMassKg: 9 }

/** The sample's run status on a clock, drawn by the real analysis: nothing in the season says what the status is. */
const runStatus = (clock = SAMPLE_CLOCK) =>
  new AnalysisSession().loadSample(SETTINGS, clock).fitness.run

describe('the sample athlete’s fitness story', () => {
  const status = runStatus()

  it('speaks: a slip at the same heart rate, found by the detector with a range clear of zero', () => {
    expect(status.state).toBe('slipping')
    expect(status.change!.high).toBeLessThan(0)
    expect(status.change!.value).toBeLessThan(-0.04)
    expect(status.now!).toBeLessThan(status.before!)
    expect(status.onsetMs!).toBeLessThan(status.asOfMs)
  })

  it('rests on enough steady runs to show the evidence behind it', () => {
    expect(status.steady).toBeGreaterThanOrEqual(40)
    expect(status.evidence!.recent.runs).toBeGreaterThanOrEqual(6)
    expect(status.evidence!.baseline!.runs).toBeGreaterThanOrEqual(12)
    const ids = new Set(samplePlan().map((entry) => entry.spec.id))
    expect(status.evidence!.recent.ids.every((id) => ids.has(id))).toBe(true)
    expect(status.series.length).toBeGreaterThanOrEqual(8)
  })

  it('reports a change whose range holds the one planted: the true change in easy pace at one heart rate', () => {
    // Speed at a heart rate is the inverse of the running cost the plan drew, so the plan says the true level of each
    // easy run; the status's change is the mean of the recent runs' levels against the middle of the earlier ones.
    const plan = samplePlan(SAMPLE_CLOCK)
    const level = (fromMs: number, toMs: number) => {
      const values = plan
        .filter(
          (entry) =>
            entry.spec.sport === 'run' &&
            entry.spec.effort === 'easy' &&
            entry.spec.startMs >= fromMs &&
            entry.spec.startMs <= toMs,
        )
        .map((entry) => -Math.log(entry.athlete.runEconomyScale))
        .sort((a, b) => a - b)
      return {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        median: values[Math.floor(values.length / 2)]!,
      }
    }
    const { recent, baseline } = status.evidence!
    const truth =
      Math.exp(
        level(recent.fromMs, recent.toMs).mean - level(baseline!.fromMs, baseline!.toMs).median,
      ) - 1
    expect(truth).toBeLessThan(-0.04)
    expect(truth).toBeGreaterThanOrEqual(status.change!.low)
    expect(truth).toBeLessThanOrEqual(status.change!.high)
  })

  it('draws the slip as a fall that ends in a plateau, not a recovery: the last steps never rise by more than a point', () => {
    const values = status.series.map((point) => point.value)
    const last = values.slice(-3)
    expect(last[0]!).toBeGreaterThan(last[1]!)
    expect(last[2]! / last[1]! - 1).toBeLessThan(0.01)
    expect(Math.min(...values.slice(0, -3))).toBeGreaterThan(last[1]!)
  })

  it('began to be shown within the last six weeks, so it is new on a first visit', () => {
    expect(status.asOfMs - status.entered!.atMs).toBeLessThan(6 * WEEK_MS)
  })

  it('reads in plain words, with no pace or cause the data cannot give', () => {
    const { headline, support } = fitnessLines(status, 'metric')
    expect(headline).toMatch(
      /^At \d+ bpm you now run \d:\d{2} \/km, [\d.]+% \(\d+ to \d+%\) slower than the \d:\d{2} \/km before \d{1,2} [A-Z][a-z]{2}\.$/,
    )
    expect(lintCopy(`${headline} ${support}`)).toEqual([])
  })

  it('tells the same story whatever day of the week, week or time zone it is loaded in', () => {
    const clocks = [
      { nowMs: SAMPLE_REFERENCE_NOW_MS + 3 * DAY_MS },
      { nowMs: SAMPLE_REFERENCE_NOW_MS + 9 * WEEK_MS, utcOffsetMinutes: () => -480 },
      { nowMs: SAMPLE_REFERENCE_NOW_MS + 30 * WEEK_MS, utcOffsetMinutes: () => 780 },
    ]
    for (const clock of clocks) {
      const other = runStatus(clock)
      expect(other.state).toBe(status.state)
      expect(other.steady).toBe(status.steady)
      // A zone can move a run across a week's edge, so the windows differ a little: the size stays within a point.
      expect(Math.abs(other.change!.value - status.change!.value)).toBeLessThan(0.01)
      expect(other.change!.high).toBeLessThan(0)
    }
  }, 60_000)

  it('compares the rides as well: the sample has measured-power rides, too few and too varied to call level yet', () => {
    const rides = new AnalysisSession().loadSample(SETTINGS, SAMPLE_CLOCK).fitness.ride
    expect(rides.shortfall?.kind).not.toBe('unavailable')
    expect(rides.steady).toBeGreaterThanOrEqual(20)
    expect(rides.referenceHr).not.toBeNull()
    expect(rides.evidence!.method.tier).toBe('power')
  })
})

describe('the planted slip', () => {
  const plan = samplePlan()
  const weeksBefore = (startMs: number) => (SAMPLE_CLOCK.nowMs - startMs) / WEEK_MS
  const isEasyRun = (entry: (typeof plan)[number]) =>
    entry.spec.sport === 'run' && entry.spec.effort === 'easy'
  /** The athlete's running cost on the season's own line: 1.05 of today's at the start, 1 at the end, times the body's 1.03. */
  const seasonLine = (entry: (typeof plan)[number]) => entry.athlete.runEconomyScale / 1.03

  it('is nothing before it starts, falls in a straight line over four weeks and stays down', () => {
    expect(easySlipOn(40 * 7)).toBe(0)
    expect(easySlipOn(9 * 7)).toBe(0)
    expect(easySlipOn(8.5 * 7)).toBeCloseTo(easySlipOn(0) / 8, 6)
    expect(easySlipOn(7 * 7)).toBeCloseTo(easySlipOn(0) / 2, 6)
    expect(easySlipOn(5 * 7)).toBe(easySlipOn(0))
    expect(easySlipOn(0)).toBeGreaterThan(0.05)
  })

  it('wobbles from one week to the next, the same on every day of a week and on every load, within a point or so', () => {
    const weeks = Array.from({ length: 20 }, (_, week) => easyWobbleOn(week * 7 + 3))
    expect(new Set(weeks.map((w) => w.toFixed(6))).size).toBeGreaterThan(15)
    for (const wobble of weeks) expect(Math.abs(wobble)).toBeLessThanOrEqual(0.012)
    expect(easyWobbleOn(14)).toBe(easyWobbleOn(20))
    expect(easyWobbleOn(14)).not.toBe(easyWobbleOn(21))
  })

  it('costs only easy runs: tests, races, tempo, intervals and every ride keep the season’s line', () => {
    for (const entry of plan.filter((entry) => !isEasyRun(entry))) {
      expect(seasonLine(entry)).toBeLessThanOrEqual(1.0501)
    }
    const recentEasy = plan.filter(
      (entry) => isEasyRun(entry) && weeksBefore(entry.spec.startMs) < 5,
    )
    expect(recentEasy.length).toBeGreaterThan(4)
    for (const entry of recentEasy) expect(seasonLine(entry)).toBeGreaterThan(1.05)
    const earlierEasy = plan.filter(
      (entry) => isEasyRun(entry) && weeksBefore(entry.spec.startMs) > 10,
    )
    // Before the slip an easy run is on the season's line to within the week's wobble.
    expect(earlierEasy.length).toBeGreaterThan(10)
    for (const entry of earlierEasy) expect(seasonLine(entry)).toBeLessThanOrEqual(1.05 * 1.0121)
  })
})

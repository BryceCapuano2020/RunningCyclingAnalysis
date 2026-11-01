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
    expect(status.steady).toBeGreaterThanOrEqual(25)
    expect(status.evidence!.recent.runs).toBeGreaterThanOrEqual(6)
    expect(status.evidence!.baseline!.runs).toBeGreaterThanOrEqual(12)
    const ids = new Set(samplePlan().map((entry) => entry.spec.id))
    expect(status.evidence!.recent.ids.every((id) => ids.has(id))).toBe(true)
    expect(status.series.length).toBeGreaterThanOrEqual(6)
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

  // One other week and zone, since each clock draws a whole season of its own. The other days of the week and
  // zones are in sessionSample.fitness.sim.test.ts.
  it('tells the same story in another week and time zone', () => {
    const other = runStatus({
      nowMs: SAMPLE_REFERENCE_NOW_MS + 9 * WEEK_MS,
      utcOffsetMinutes: () => -480,
    })
    expect(other.state).toBe(status.state)
    expect(other.steady).toBe(status.steady)
    // A zone can move a run across a week's edge, so the windows differ a little: the size stays within two points.
    expect(Math.abs(other.change!.value - status.change!.value)).toBeLessThan(0.02)
    expect(other.change!.high).toBeLessThan(0)
  })

  it('compares the rides as well, and says it has too few from before the last 8 weeks: the sample’s one not-enough state', () => {
    const rides = new AnalysisSession().loadSample(SETTINGS, SAMPLE_CLOCK).fitness.ride
    expect(rides.state).toBe('not-enough-evidence')
    expect(rides.shortfall).toMatchObject({ kind: 'history' })
    const shortfall = rides.shortfall as Extract<typeof rides.shortfall, { kind: 'history' }>
    expect(shortfall.have).toBeGreaterThan(0)
    expect(shortfall.have).toBeLessThan(shortfall.need)
    expect(rides.steady).toBeGreaterThanOrEqual(12)
    expect(rides.referenceHr).not.toBeNull()
    // It tells its level in watts, and what a trend needs, where it used to refuse.
    const lines = fitnessLines(rides, 'metric')
    expect(lines.headline).toMatch(/^\d+ W at \d+ bpm \(\d+ to \d+\)\.$/)
    expect(lines.support).toMatch(/^From \d+ steady rides\.$/)
    expect(lines.needs).toMatch(/^\d+ more earlier rides? to see a trend\.$/)
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

  it('wanders from one week to the next, the same on every day of a week and on every load, by about 2% a week', () => {
    // The model's marginal spread is 2% (AR(1) at 0.9 a week); over the season's 56 weeks the draw's own is 1% to 3%,
    // and no week is further than 2 marginal sd out.
    const levels = Array.from({ length: 56 }, (_, week) => Math.log(1 + easyWobbleOn(week * 7 + 3)))
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length
    const sd = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length)
    expect(sd).toBeGreaterThan(0.01)
    expect(sd).toBeLessThan(0.03)
    expect(new Set(levels.map((l) => l.toFixed(6))).size).toBeGreaterThan(50)
    for (const level of levels) expect(Math.abs(level)).toBeLessThanOrEqual(0.04)
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
    const mean = (entries: typeof plan) =>
      entries.reduce((sum, entry) => sum + seasonLine(entry), 0) / entries.length
    // The slip is 14% over the season's line, the week's wander and each run's own draw (a few points) on top.
    expect(mean(recentEasy)).toBeGreaterThan(1.08)
    const earlierEasy = plan.filter(
      (entry) => isEasyRun(entry) && weeksBefore(entry.spec.startMs) > 10,
    )
    // Before the slip an easy run is on the season's line, give or take the week's wander and its own draw.
    expect(earlierEasy.length).toBeGreaterThan(10)
    expect(mean(earlierEasy)).toBeLessThanOrEqual(1.05 * 1.03)
    for (const entry of earlierEasy) expect(seasonLine(entry)).toBeLessThanOrEqual(1.05 * 1.25)
  })
})

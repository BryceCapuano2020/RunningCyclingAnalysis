import { describe, expect, it } from 'vitest'
import { DAY_MS, HEADLINE_DURATION_S } from '../constants'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { centralWkgFromWatts, combine, equivalentRunSpeed } from './combine'
import { digestActivity } from './digestActivity'
import { MODEL_REVISION } from './modelRevision'
import { fitnessTrend } from './trend'
import { trendWindowDays, weeksWithValue } from './trendPoints'

const WEEK = 7 * DAY_MS
const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
/** Monday 6 January 2025, midday UTC. */
const MONDAY = Date.UTC(2025, 0, 6, 12)
/** The Sunday that ends the week of MONDAY, at the last millisecond UTC. */
const FIRST_SUNDAY_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

const samples = sampleDataset().activities.map((activity) => digestActivity(activity))
const sampleOf = (sport: Sport): ActivityDigest => {
  const found = samples.find((digest) => digest.sport === sport)
  if (found === undefined) throw new Error(`The sample has no ${sport}`)
  return found
}

/**
 * A digest with one curve value, at durationS, and nothing at any other duration. Rides carry
 * measured watts here, not virtual-power terms.
 */
function at(
  base: ActivityDigest,
  startMs: number,
  value: number,
  durationS = HEADLINE_DURATION_S,
): ActivityDigest {
  return {
    ...base,
    id: `${startMs}-${base.sport}-${value}`,
    startMs,
    curve: base.curve.map((point) => ({
      ...point,
      value: point.durationS === durationS ? value : Number.NaN,
      terms: null,
    })),
  }
}

/** A digest with the given curve values, at the given durations, and nothing elsewhere. */
function atDurations(
  base: ActivityDigest,
  startMs: number,
  values: Record<number, number>,
): ActivityDigest {
  return {
    ...base,
    id: `${startMs}-${base.sport}-multi`,
    startMs,
    curve: base.curve.map((point) => ({
      ...point,
      value: values[point.durationS] ?? Number.NaN,
      terms: null,
    })),
  }
}

const run = (startMs: number, wkg: number) => at(sampleOf('run'), startMs, wkg)
const ride = (startMs: number, watts: number) => at(sampleOf('ride'), startMs, watts)

describe('fitnessTrend', () => {
  it('counts the weeks with a run or a ride value', () => {
    const week = (runWkg: number | null, rideWkg: number | null) => ({
      endMs: MONDAY,
      runWkg,
      rideWkg,
      runCount: 0,
      rideCount: 0,
      runAtMs: null,
      rideAtMs: null,
      rideRunSpeed: null,
    })
    expect(weeksWithValue([week(null, null), week(15, null), week(null, 14)])).toBe(2)
    expect(weeksWithValue([week(null, null)])).toBe(0)
  })

  it('gives no points for no activities', () => {
    expect(fitnessTrend([], settings)).toEqual([])
  })

  it('gives one point with no ride value for one run', () => {
    const points = fitnessTrend([run(MONDAY, 17)], settings)
    expect(points).toEqual([
      {
        endMs: FIRST_SUNDAY_END,
        runWkg: 17,
        rideWkg: null,
        runCount: 1,
        rideCount: 0,
        runAtMs: MONDAY,
        rideAtMs: null,
        rideRunSpeed: null,
      },
    ])
  })

  it('names the start of the run and of the ride that set each week’s value', () => {
    const [point] = fitnessTrend([run(MONDAY, 17), ride(MONDAY + DAY_MS, 250)], settings)
    expect(point?.runAtMs).toBe(MONDAY)
    expect(point?.rideAtMs).toBe(MONDAY + DAY_MS)
  })

  it('gives the equivalent running speed of the best ride only when asked, from the same model', () => {
    const digests = [ride(MONDAY, 250)]
    expect(fitnessTrend(digests, settings)[0]?.rideRunSpeed).toBeNull()
    const [point] = fitnessTrend(digests, settings, { equivalence: { hr: null } })
    expect(point?.rideRunSpeed).toEqual(equivalentRunSpeed(250, settings.massKg, null))
  })

  it('gives the sample’s best ride the running equivalent that the analysis gives, to the bit', () => {
    const analysis = combine(samples, settings)
    const headline = analysis.equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
    const watts = analysis.rideCurve.find((p) => p.durationS === HEADLINE_DURATION_S)?.value
    expect(headline).toBeDefined()
    expect(watts).toBeDefined()
    // A window longer than the sample holds every activity, so the last point is the period's best.
    const last = fitnessTrend(samples, settings, {
      windowDays: 400,
      bikeModel: analysis.bikeModel,
      equivalence: { hr: analysis.hr },
    }).at(-1)
    expect(last?.rideRunSpeed).toEqual(headline?.runSpeed)
    expect(last?.rideRunSpeed).toEqual(
      equivalentRunSpeed(watts ?? NaN, settings.massKg, analysis.hr),
    )
  })

  it('gives a one-activity period the equivalence the analysis gives at the headline duration', () => {
    const digest = ride(MONDAY, 250)
    const analysis = combine([digest], settings)
    const [point] = fitnessTrend([digest], settings, {
      bikeModel: analysis.bikeModel,
      equivalence: { hr: analysis.hr },
    })
    const headline = analysis.equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
    expect(headline).toBeDefined()
    expect(point?.rideRunSpeed).toEqual(headline?.runSpeed)
  })

  it('gives a monotone run value for a run that improves week by week', () => {
    const digests = Array.from({ length: 10 }, (_, week) =>
      run(MONDAY + week * WEEK, 14 + week * 0.2),
    )
    const values = fitnessTrend(digests, settings).map((point) => point.runWkg)
    expect(values).toHaveLength(10)
    for (let i = 0; i < values.length; i++) {
      expect(values[i]).not.toBeNull()
      if (i > 0) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!)
    }
    expect(values.at(-1)).toBeCloseTo(15.8, 10)
  })

  it('reads the best value of the sport across the window', () => {
    const points = fitnessTrend([run(MONDAY, 18), run(MONDAY + WEEK, 15)], settings)
    expect(points.map((point) => point.runWkg)).toEqual([18, 18])
    expect(points.map((point) => point.runCount)).toEqual([1, 2])
  })

  it('drops an activity once it leaves the 42-day window', () => {
    const digests = [run(MONDAY, 20), run(MONDAY + 56 * DAY_MS, 10)]
    const points = fitnessTrend(digests, settings)
    const at = (endMs: number) => points.find((point) => point.endMs === endMs)
    // Still inside the window: 16 February ends 41 days after the first run.
    expect(at(Date.UTC(2025, 1, 16, 23, 59, 59, 999))?.runWkg).toBe(20)
    // Outside it: 23 February ends 42 days after the first run, so only the gap is left.
    expect(at(Date.UTC(2025, 1, 23, 23, 59, 59, 999))?.runWkg).toBeNull()
    expect(at(Date.UTC(2025, 2, 9, 23, 59, 59, 999))?.runWkg).toBe(10)
  })

  it('gives null for a sport with no activity in the window, leaving a gap', () => {
    const digests = [run(MONDAY, 16), ride(MONDAY + 8 * WEEK, 1050)]
    const points = fitnessTrend(digests, settings)
    expect(points.find((point) => point.endMs === FIRST_SUNDAY_END)?.rideWkg).toBeNull()
    expect(points.at(-1)?.rideWkg).not.toBeNull()
    expect(points.at(-1)?.runWkg).toBeNull()
  })

  it('converts a ride the way combine does, at the prior-mean efficiency', () => {
    const digests = [ride(MONDAY, 1050)]
    const [point] = fitnessTrend(digests, settings)
    const combined = combine(digests, settings)
    expect(point?.rideWkg).toBe(
      combined.rideMetabolicCurve.find((p) => p.durationS === HEADLINE_DURATION_S)?.value,
    )
  })

  it('matches combine per activity for every sample activity', () => {
    for (const digest of samples) {
      const [point] = fitnessTrend([digest], settings)
      const combined = combine([digest], settings)
      if (digest.sport === 'run') {
        expect(point?.runWkg).toBe(
          combined.runCurve.find((p) => p.durationS === HEADLINE_DURATION_S)?.value,
        )
      } else {
        expect(point?.rideWkg).toBe(
          combined.rideMetabolicCurve.find((p) => p.durationS === HEADLINE_DURATION_S)?.value,
        )
      }
    }
  })

  it('takes the best converted value at the headline duration or longer, as the envelope does', () => {
    // A 30-minute value above the 20-minute one: combine's envelope lifts the 20-minute value.
    const ride = atDurations(sampleOf('ride'), MONDAY, { 1200: 1000, 1800: 1100 })
    const runDigest = atDurations(sampleOf('run'), MONDAY, { 1200: 15, 1800: 16 })
    const [point] = fitnessTrend([ride, runDigest], settings)
    const combined = combine([ride, runDigest], settings)
    const at = (points: { durationS: number; value: number }[]) =>
      points.find((p) => p.durationS === HEADLINE_DURATION_S)?.value
    expect(point?.rideWkg).toBe(centralWkgFromWatts(1100, settings.massKg))
    expect(point?.rideWkg).toBe(at(combined.rideMetabolicCurve))
    expect(point?.runWkg).toBe(16)
    expect(point?.runWkg).toBe(at(combined.runCurve))
  })

  it('agrees with combine over a whole set, so both fit one bike model', () => {
    const last = fitnessTrend(samples, settings, { windowDays: 10_000 }).at(-1)
    const combined = combine(samples, settings)
    const at = (points: { durationS: number; value: number }[]) =>
      points.find((p) => p.durationS === HEADLINE_DURATION_S)?.value
    expect(last?.runWkg).toBe(at(combined.runCurve))
    expect(last?.rideWkg).toBe(at(combined.rideMetabolicCurve))
  })

  it('reads the requested duration', () => {
    const digest = at(sampleOf('run'), MONDAY, 12, 300)
    expect(fitnessTrend([digest], settings, { durationS: 300 })[0]?.runWkg).toBe(12)
    expect(fitnessTrend([digest], settings)[0]?.runWkg).toBeNull()
  })

  it('places week ends at Sunday 23:59:59.999 UTC', () => {
    // Sunday 23:30 and Monday 00:30 UTC fall in different weeks.
    const points = fitnessTrend(
      [run(Date.UTC(2025, 0, 12, 23, 30), 16), run(Date.UTC(2025, 0, 13, 0, 30), 17)],
      settings,
    )
    expect(points.map((point) => new Date(point.endMs).toISOString())).toEqual([
      '2025-01-12T23:59:59.999Z',
      '2025-01-19T23:59:59.999Z',
    ])
  })

  it('ignores digests from another model revision', () => {
    const stale = { ...run(MONDAY, 17), modelRevision: MODEL_REVISION - 1 }
    expect(fitnessTrend([stale], settings)).toEqual([])
  })

  it('keeps only the most recent 260 weeks', () => {
    const digests = Array.from({ length: 300 }, (_, week) => run(MONDAY + week * WEEK, 10))
    const points = fitnessTrend(digests, settings)
    expect(points).toHaveLength(260)
    expect(points[0]?.endMs).toBe(FIRST_SUNDAY_END + 40 * WEEK)
    expect(points.at(-1)?.endMs).toBe(FIRST_SUNDAY_END + 299 * WEEK)
  })

  it('starts at the first week whose whole window fits after fromMs', () => {
    const digests = [run(MONDAY, 17), run(MONDAY + 3 * WEEK, 16)]
    const points = fitnessTrend(digests, settings, { windowDays: 14, fromMs: MONDAY })
    // The first week whose 14-day window fits after 6 January ends on Sunday 26 January, so that
    // window starts on 12 January.
    expect(points[0]?.endMs).toBe(Date.UTC(2025, 0, 26, 23, 59, 59, 999))
  })

  it('never counts an activity from before fromMs in a trailing window', () => {
    const digests = [run(MONDAY - WEEK, 25), run(MONDAY + 2 * WEEK, 16)]
    const points = fitnessTrend(digests, settings, { windowDays: 14, fromMs: MONDAY })
    expect(points.map((point) => point.runWkg)).toEqual([16])
  })

  it('rejects a body mass or bike mass that is not a positive finite number', () => {
    const bad: AthleteSettings[] = [
      { massKg: 0, bikeMassKg: 9 },
      { massKg: 75, bikeMassKg: -9 },
      { massKg: Number.NaN, bikeMassKg: 9 },
      { massKg: 75, bikeMassKg: Number.POSITIVE_INFINITY },
    ]
    for (const s of bad) {
      expect(() => fitnessTrend([], s)).toThrow(RangeError)
      expect(() => fitnessTrend(samples, s)).toThrow(RangeError)
    }
  })
})

describe('trendWindowDays', () => {
  it('is six weeks for all time, and a third of a shorter period', () => {
    expect(trendWindowDays(null)).toBe(42)
    expect(trendWindowDays(42)).toBe(14)
    expect(trendWindowDays(91)).toBe(30)
    expect(trendWindowDays(365)).toBe(42)
  })

  it('never judges a period in windows shorter than a week', () => {
    expect(trendWindowDays(1)).toBe(7)
    expect(trendWindowDays(10)).toBe(7)
    expect(trendWindowDays(21)).toBe(7)
  })
})

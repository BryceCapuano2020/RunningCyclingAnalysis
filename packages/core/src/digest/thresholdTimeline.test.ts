import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { massesOf } from './masses'
import { fitBikeModelOver } from './rideCurves'
import { orderedCurrent } from './ordered'
import { judgeHeartRate } from './setAside'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { sampleDataset } from '../synthetic'
import { thresholdTimeline } from './thresholdTimeline'
import { librariesOf, thresholdsOf } from './thresholdLibraries'
import { STALE_THRESHOLD_DAYS, THRESHOLD_WINDOW_WEEKS, thresholdAt } from './thresholdTimelineTypes'
import { weekEndMs } from './trendPoints'
import { FIRST_MONDAY_MS, levelRun, shortRun, strideRun, weeklyRuns } from './test/runLibrary'
import type { ActivityDigest, AthleteSettings } from '../types'
import type { ThresholdStep } from './thresholdTimelineTypes'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const WEEK_MS = 7 * DAY_MS

function timelineOf(digests: ActivityDigest[]) {
  const ordered = orderedCurrent(digests)
  const masses = massesOf(SETTINGS)
  return thresholdTimeline(ordered, masses, fitBikeModelOver(ordered, masses).model, null)
}

const weekMs = (week: number) => FIRST_MONDAY_MS + week * WEEK_MS

describe('thresholdTimeline', () => {
  it('fits the half year before each week, so it follows the athlete up and down', () => {
    // Fit rises for a year and a half, then falls for a year and a half.
    const library = weeklyRuns(0, 156, (week) =>
      week < 78 ? 0.8 + week * 0.004 : 1.11 - (week - 78) * 0.004,
    )
    const { run } = timelineOf(library)
    const cp = (week: number) => thresholdAt(run, weekMs(week))!.fit.cp
    expect(cp(100)).toBeGreaterThan(cp(30))
    expect(cp(150)).toBeLessThan(cp(80))
    // A window holds the last 26 weeks: week 150 is cut from the runs of weeks 125 to 150 and not from the peak.
    const lastHalfYear = library.filter(
      (_, week) => week > 150 - THRESHOLD_WINDOW_WEEKS && week <= 150,
    )
    expect(cp(150)).toBeCloseTo(combine(lastHalfYear, SETTINGS).runThreshold!.value, 8)
  })

  it('is the analysis’s run threshold for a window that holds the whole library', () => {
    const library = weeklyRuns(0, 20, (week) => 0.9 + week * 0.005)
    const steps = timelineOf(library).run
    expect(steps.at(-1)!.fit).toBeNull()
    const analysed = combine(library, SETTINGS).runThreshold!
    // The window that ends with the last run holds all of them.
    const whole = thresholdAt(steps, weekMs(19) + 2 * DAY_MS)!.fit
    expect(whole.cp).toBeCloseTo(analysed.value, 8)
    // Its standard error is the power estimate's relative error, not the width of the range.
    expect(whole.cpSe).toBeCloseTo(analysed.value * analysed.efforts.relativeError, 8)
    expect(judgeHeartRate(library, SETTINGS).thresholdTimeline.run).toEqual(steps)
  })

  it('keeps one step for the weeks that change nothing: a run entering the window, and the first one leaving it', () => {
    const { run } = timelineOf(weeklyRuns(0, 12, () => 1))
    expect(run.length).toBe(12 + 12)
    expect(run.every((step, i) => i === 0 || step.fromMs > run[i - 1]!.fromMs)).toBe(true)
    // After the last run has left there is no fit, and the step before it is where the fit was last made.
    expect(run.at(-1)).toMatchObject({ fit: null, asOfMs: null, lastFit: run.length - 2 })
  })

  it('has no fit for a half year without an effort of 3 min, and then holds the last one that had it', () => {
    // 20 weeks of runs with a hard 20 minutes, then 40 weeks of strides, which hold no effort to read a threshold from.
    const hard = weeklyRuns(0, 20, () => 1)
    const easy = Array.from({ length: 40 }, (_, i) => strideRun(`easy-${i}`, (20 + i) * 7 + 2, 1))
    const { run } = timelineOf([...hard, ...easy])
    const lastHard = FIRST_MONDAY_MS + (19 * 7 + 2) * DAY_MS
    const during = thresholdAt(run, weekMs(25) + 2 * DAY_MS)
    expect(during).toMatchObject({ asOfMs: null })
    // From week 46 the half year holds only strides: the fit of week 45, dated by its newest run, stands in.
    const after = thresholdAt(run, weekMs(50) + 2 * DAY_MS)
    expect(after).toMatchObject({ asOfMs: lastHard })
    // The same run, read later: as old as the strides that followed it make it, so the estimate is the less sure.
    expect(after!.fit.cp).toBeCloseTo(during!.fit.cp, 8)
    expect(after!.fit.cpSe).toBeGreaterThan(during!.fit.cpSe)
  })

  it('reads a window of short runs from their short efforts: they are evidence, a threshold from an hour done is not asked for', () => {
    const hard = weeklyRuns(0, 20, () => 1)
    const short = Array.from({ length: 40 }, (_, i) => shortRun(`short-${i}`, (20 + i) * 7 + 2, 1))
    const { run } = timelineOf([...hard, ...short])
    // Week 50 holds only short runs and has a fit of its own, not the older one.
    expect(thresholdAt(run, weekMs(50) + 2 * DAY_MS)).toMatchObject({ asOfMs: null })
  })

  it('follows a steady run far above the older level at once, by the hour it held', () => {
    // 20 weeks at one level, then a steady run: every duration holds one value, 50% over the older level's hour. Its short
    // efforts read nothing like the others', and the hour is the one thing it proves, so the threshold stands at it.
    const steady = levelRun('steady', 20 * 7 + 2, 1)
    const flat = (14 + 900 / 1200) * 1.5
    steady.curve = steady.curve.map((point) => ({ ...point, value: flat }))
    const { run } = timelineOf([...weeklyRuns(0, 20, () => 1), steady])
    const older = thresholdAt(run, weekMs(19) + 2 * DAY_MS)!.fit.cp
    expect(thresholdAt(run, steady.startMs)!.fit.cp).toBeCloseTo(flat, 8)
    expect(thresholdAt(run, steady.startMs)!.fit.cp).toBeGreaterThan(older * 1.3)
  })

  it('has nothing for a sport with no efforts, and none from an indoor run', () => {
    const indoor = { ...levelRun('belt', 3, 1), indoor: true }
    expect(timelineOf([indoor])).toEqual({ run: [], ride: [] })
    expect(timelineOf([])).toEqual({ run: [], ride: [] })
  })
})

describe('thresholdAt', () => {
  // Thirty weeks of runs at one level, then nothing.
  const run = timelineOf(weeklyRuns(0, 30, () => 1)).run
  const lastRun = weekMs(29) + 2 * DAY_MS
  const lastAsOf = FIRST_MONDAY_MS + (29 * 7 + 2) * DAY_MS

  it('uses the half year ending in the week while it holds a fit', () => {
    expect(thresholdAt(run, lastRun)).toMatchObject({ asOfMs: null })
  })

  it('falls back to the last fit, dated, when the window can no longer make one', () => {
    const later = lastAsOf + 40 * WEEK_MS
    const found = thresholdAt(run, later)
    expect(found).not.toBeNull()
    expect(found!.asOfMs).toBe(lastAsOf)
  })

  it('has none once the last fit is more than a year old', () => {
    const at = lastAsOf + STALE_THRESHOLD_DAYS * DAY_MS
    expect(thresholdAt(run, at)).not.toBeNull()
    expect(thresholdAt(run, at + 8 * DAY_MS)).toBeNull()
  })

  it('has none before the first run', () => {
    expect(thresholdAt(run, FIRST_MONDAY_MS - 30 * DAY_MS)).toBeNull()
    expect(thresholdAt([], lastRun)).toBeNull()
  })
})

describe('thresholdTimeline against the library', () => {
  // The sample's runs and rides (power-meter and virtual), copied every 9 days over two years, so a window holds
  // some of them and the weeks change which.
  const base = sampleDataset().activities.map((activity) => digestActivity(activity))
  const library: ActivityDigest[] = Array.from({ length: base.length * 80 }, (_, i) => {
    const source = base[i % base.length]!
    return Object.assign({}, source, {
      id: `c${i}`,
      startMs: source.startMs + Math.floor(i / base.length) * 9 * DAY_MS,
    })
  })
  const judged = judgeHeartRate(library, SETTINGS)
  const ordered = orderedCurrent(library)
  const masses = massesOf(SETTINGS)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  const windowOf = (fromMs: number) =>
    ordered.filter(
      (digest) =>
        weekEndMs(digest.startMs) <= fromMs &&
        weekEndMs(digest.startMs) > fromMs - THRESHOLD_WINDOW_WEEKS * WEEK_MS,
    )

  it('has, for every week, the run threshold of the runs of its half year, as the analysis reads them', () => {
    const setAside = new Set(ordered.filter((_, i) => i % 5 === 0).map((digest) => digest.id))
    const effort = { referenceHr: { run: 182, ride: 176 }, setAside }
    const inputs = { masses, bikeModel, gate: judged.rideGate, heartSetAside: setAside }
    const libraries = librariesOf(ordered, inputs, effort.referenceHr)
    const timeline = thresholdTimeline(
      ordered,
      masses,
      bikeModel,
      judged.rideGate,
      effort,
      libraries,
    )
    const lines = { run: libraries.run.line, ride: libraries.ride.line }
    // A run's threshold reads pace alone, so its line is refused whatever the run reference heart rate is.
    expect(lines.run).toEqual({ refused: 'no-heart-rate' })
    let compared = 0
    timeline.run.forEach((step, i) => {
      if (i % 4 !== 0) return
      const expected = thresholdsOf(windowOf(step.fromMs), inputs, effort.referenceHr, lines).run
      if (expected === null) expect(step.fit).toBeNull()
      else {
        expect(step.fit!.cp).toBeCloseTo(expected.value, 8)
        expect(step.fit!.cpSe).toBeCloseTo(expected.value * expected.efforts.relativeError, 8)
        expect(expected.heartRate).toEqual({ refused: 'no-heart-rate' })
        expect(expected.value).toBe(expected.efforts.value)
      }
      compared++
    })
    expect(compared).toBeGreaterThan(20)
    expect(judged.rideGate).not.toBeNull()
  })

  it('has, for every week, the ride threshold of the rides of its half year, as the analysis reads them', () => {
    const setAside = new Set(ordered.filter((_, i) => i % 7 === 0).map((digest) => digest.id))
    const effort = { referenceHr: { run: 182, ride: 176 }, setAside }
    // The line is the library's, fitted once; a window reads it, as a period does.
    const inputs = { masses, bikeModel, gate: judged.rideGate, heartSetAside: setAside }
    const libraries = librariesOf(ordered, inputs, effort.referenceHr)
    const timeline = thresholdTimeline(
      ordered,
      masses,
      bikeModel,
      judged.rideGate,
      effort,
      libraries,
    )
    let compared = 0
    let withHeartRate = 0
    timeline.ride.forEach((step, i) => {
      if (i % 4 !== 0) return
      const window = windowOf(step.fromMs)
      const lines = { run: libraries.run.line, ride: libraries.ride.line }
      const expected = thresholdsOf(window, inputs, effort.referenceHr, lines).ride
      if (expected === null) expect(step.fit).toBeNull()
      else {
        expect(step.fit!.cp).toBeCloseTo(expected.value, 8)
        expect(step.fit!.cpSe).toBeCloseTo(expected.value * expected.efforts.relativeError, 8)
        if ('value' in expected.heartRate) withHeartRate++
      }
      compared++
    })
    expect(compared).toBeGreaterThan(20)
    expect(withHeartRate).toBeGreaterThan(0)
  })

  it('fits a window of rides whatever its heart rate said of the effort: the gate is a label', () => {
    const rides = ordered.filter((digest) => digest.sport === 'ride')
    const easy = rides.map((ride) =>
      Object.assign({}, ride, {
        curve: ride.curve.map((point) => Object.assign({}, point, { heartRate: 120 })),
      }),
    )
    const effort = { referenceHr: { run: 182, ride: 176 }, setAside: new Set<string>() }
    const hard = thresholdTimeline(rides, masses, bikeModel, judged.rideGate, effort).ride
    const soft = thresholdTimeline(easy, masses, bikeModel, judged.rideGate, effort).ride
    expect(soft.filter((step) => step.fit !== null).length).toBe(
      hard.filter((step) => step.fit !== null).length,
    )
    expect(hard.filter((step) => step.fit !== null).length).toBeGreaterThan(20)
  })
})

describe('thresholdTimeline and the effort gate', () => {
  /** Weekly runs whose 20 minutes was held at a heart rate, in bpm. */
  function runsAt(bpm: number, from = 0, weeks = 20): ActivityDigest[] {
    return weeklyRuns(from, weeks, () => 1).map((run) =>
      Object.assign({}, run, {
        hasHeartRate: true,
        maxHeartRate: bpm,
        curve: run.curve.map((point) => Object.assign({}, point, { heartRate: bpm })),
      }),
    )
  }
  const fits = (steps: ThresholdStep[]) => steps.filter((step) => step.fit !== null).length

  it('fits every window whatever its heart rate says: a window that was not hard is not held back', () => {
    const hard = fits(timelineOf(runsAt(172)).run)
    expect(hard).toBeGreaterThan(10)
    expect(fits(timelineOf(runsAt(140)).run)).toBe(hard)
  })

  it('reads a run window from the runs alone when none has a heart-rate block: a change of judgement takes the same steps', () => {
    const library = runsAt(176)
    const ordered = orderedCurrent(library)
    const masses = massesOf(SETTINGS)
    const bikeModel = fitBikeModelOver(ordered, masses).model
    const judged = (setAside: Set<string>) =>
      thresholdTimeline(ordered, masses, bikeModel, null, {
        referenceHr: { run: 180, ride: 174 },
        setAside,
      }).run
    expect(judged(new Set(library.map((run) => run.id)))).toEqual(judged(new Set()))
  })

  it('moves with the window: easy weeks after hard ones leave the older fit to answer', () => {
    // 20 hard weeks, then 20 weeks of runs at an easy heart rate: the windows go on fitting the runs they hold.
    const run = timelineOf([...runsAt(172, 0, 20), ...runsAt(140, 20, 20)]).run
    expect(run.slice(20, 40).every((step) => step.fit !== null)).toBe(true)
    expect(run.at(-1)!.fit).toBeNull()
  })
})

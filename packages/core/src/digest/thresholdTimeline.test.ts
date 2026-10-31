import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { massesOf } from './masses'
import { fitBikeModelOver } from './rideCurves'
import { orderedCurrent } from './ordered'
import { judgeHeartRate } from './setAside'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { plainCurve } from './bestCurve'
import { bestCurves } from './rideCurves'
import { criticalPowerOutcome, wPrimeFloor } from '../cp'
import { sampleDataset } from '../synthetic'
import { thresholdTimeline } from './thresholdTimeline'
import { STALE_THRESHOLD_DAYS, THRESHOLD_WINDOW_WEEKS, thresholdAt } from './thresholdTimelineTypes'
import { weekEndMs } from './trendPoints'
import { FIRST_MONDAY_MS, levelRun, shortRun, weeklyRuns } from './test/runLibrary'
import type { ActivityDigest, AthleteSettings } from '../types'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const WEEK_MS = 7 * DAY_MS

function timelineOf(digests: ActivityDigest[]) {
  const ordered = orderedCurrent(digests)
  const masses = massesOf(SETTINGS)
  return thresholdTimeline(ordered, masses, fitBikeModelOver(ordered, masses).model, 70, null)
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
    expect(cp(150)).toBe(combine(lastHalfYear, SETTINGS).runCp!.cp)
  })

  it('is the library fit for a window that holds the whole library', () => {
    const library = weeklyRuns(0, 20, (week) => 0.9 + week * 0.005)
    const steps = timelineOf(library).run
    const judged = judgeHeartRate(library, SETTINGS)
    expect(steps.at(-1)!.fit).toBeNull()
    expect(steps.findLast((step) => step.fit !== null)!.fit).toEqual(judged.fit.run)
    expect(judged.thresholdTimeline.run).toEqual(steps)
  })

  it('keeps one step for the weeks that change nothing: a run entering the window, and the first one leaving it', () => {
    const { run } = timelineOf(weeklyRuns(0, 12, () => 1))
    expect(run.length).toBe(12 + 12)
    expect(run.every((step, i) => i === 0 || step.fromMs > run[i - 1]!.fromMs)).toBe(true)
    // After the last run has left there is no fit, and the step before it is where the fit was last made.
    expect(run.at(-1)).toMatchObject({ fit: null, asOfMs: null, lastFit: run.length - 2 })
  })

  it('has no fit for a half year without a long effort, and then holds the last one that had it', () => {
    // 20 weeks of runs with a hard 20 minutes, then 40 weeks of short runs, which hold no effort to fit a threshold to.
    const hard = weeklyRuns(0, 20, () => 1)
    const easy = Array.from({ length: 40 }, (_, i) => shortRun(`easy-${i}`, (20 + i) * 7 + 2, 1))
    const { run } = timelineOf([...hard, ...easy])
    const lastHard = FIRST_MONDAY_MS + (19 * 7 + 2) * DAY_MS
    const during = thresholdAt(run, weekMs(25) + 2 * DAY_MS)
    expect(during).toMatchObject({ asOfMs: null })
    // From week 46 the half year holds only short runs: the fit of week 45, dated by its newest run, stands in.
    const after = thresholdAt(run, weekMs(50) + 2 * DAY_MS)
    expect(after).toMatchObject({ asOfMs: lastHard })
    expect(after!.fit).toEqual(during!.fit)
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

describe('thresholdTimeline against the best curves of the library', () => {
  // The sample's runs and rides (power-meter and virtual), copied every 9 days over two years, so a window holds
  // some of them and the weeks change which: the fit of each window must be the fit of the best curves of its digests.
  const base = sampleDataset().activities.map((activity) => digestActivity(activity))
  const library: ActivityDigest[] = Array.from({ length: base.length * 80 }, (_, i) => {
    const source = base[i % base.length]!
    return Object.assign({}, source, {
      id: `c${i}`,
      startMs: source.startMs + Math.floor(i / base.length) * 9 * DAY_MS,
    })
  })

  it('is, for every week, the fit the analysis would report for the digests of its half year', () => {
    const judged = judgeHeartRate(library, SETTINGS)
    const ordered = orderedCurrent(library)
    const masses = massesOf(SETTINGS)
    const bikeModel = fitBikeModelOver(ordered, masses).model
    let compared = 0
    // Ungated, as the best curves are: the effort gate has its own test below.
    const timeline = thresholdTimeline(ordered, masses, bikeModel, SETTINGS.massKg, judged.rideGate)
    for (const sport of ['run', 'ride'] as const) {
      const steps = timeline[sport]
      steps.forEach((step, i) => {
        if (i % 4 !== 0) return
        const window = ordered.filter(
          (digest) =>
            weekEndMs(digest.startMs) <= step.fromMs &&
            weekEndMs(digest.startMs) > step.fromMs - THRESHOLD_WINDOW_WEEKS * WEEK_MS,
        )
        const curves = bestCurves(window, masses, bikeModel, SETTINGS.massKg, judged.rideGate)
        const curve = sport === 'run' ? plainCurve(curves.runBest) : curves.rideMetabolic
        const expected = criticalPowerOutcome(curve, {
          minWPrime: wPrimeFloor(sport, SETTINGS.massKg),
        }).fit
        if (expected === null) expect(step.fit).toBeNull()
        else {
          expect(step.fit).not.toBeNull()
          expect(step.fit!.cp).toBeCloseTo(expected.cp, 8)
          expect(step.fit!.wPrime).toBeCloseTo(expected.wPrime, 6)
          expect(step.fit!.nPoints).toBe(expected.nPoints)
        }
        compared++
      })
    }
    expect(compared).toBeGreaterThan(40)
    expect(judged.rideGate).not.toBeNull()
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
  const effortOf = (
    reading: 'trusted' | 'low' | 'habitual' | null,
    setAside = new Set<string>(),
  ) => ({
    referenceHr: { run: 180, ride: 174 },
    referenceReading: { run: reading, ride: null },
    setAside,
  })
  const timelineWith = (digests: ActivityDigest[], effort?: ReturnType<typeof effortOf>) => {
    const ordered = orderedCurrent(digests)
    const masses = massesOf(SETTINGS)
    return thresholdTimeline(
      ordered,
      masses,
      fitBikeModelOver(ordered, masses).model,
      70,
      null,
      effort,
    ).run
  }
  const fits = (steps: ReturnType<typeof timelineWith>) =>
    steps.filter((step) => step.fit !== null).length

  it('fits the windows whose best 20 minutes was hard, and none whose was not', () => {
    expect(fits(timelineWith(runsAt(172), effortOf('trusted')))).toBeGreaterThan(10)
    expect(fits(timelineWith(runsAt(140), effortOf('trusted')))).toBe(0)
  })

  it('has no fit where the reference cannot be trusted, and every fit where there is no judge', () => {
    const library = runsAt(176)
    expect(fits(timelineWith(library, effortOf('low')))).toBe(0)
    expect(fits(timelineWith(library, effortOf('habitual')))).toBe(0)
    expect(fits(timelineWith(library))).toBeGreaterThan(10)
  })

  it('does not judge a window by a run whose heart rate is set aside, or has none', () => {
    const library = runsAt(140)
    expect(
      fits(timelineWith(library, effortOf('trusted', new Set(library.map((r) => r.id))))),
    ).toBeGreaterThan(10)
    expect(fits(timelineWith(library, effortOf(null)))).toBeGreaterThan(10)
  })

  it('moves with the window: easy weeks after hard ones leave the older fit to answer', () => {
    // 20 hard weeks, then 20 weeks of runs at an easy heart rate. Once the hard weeks leave the window the steps have no fit,
    // where the ungated timeline would go on fitting the easy runs.
    const library = [...runsAt(172, 0, 20), ...runsAt(140, 20, 20)]
    const gated = timelineWith(library, effortOf('trusted'))
    const ungated = timelineWith(library)
    expect(fits(gated)).toBeLessThan(fits(ungated))
    expect(gated.at(-1)!.fit).toBeNull()
  })
})

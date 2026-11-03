import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { fastestMs } from '../test/timing'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest } from '../types'
import { digestActivity } from './digestActivity'
import { massesOf } from './masses'
import { orderedCurrent } from './ordered'
import { fitBikeModelOver } from './rideCurves'
import { thresholdTimeline } from './thresholdTimeline'

/**
 * The threshold over time is worked out once per library change, beside the library's own fits: each digest is priced
 * once and each week costs one estimate over the window's activities. On 2,000 activities, about ten a week for four
 * years (860 runs, 1,140 rides), it takes about 19 ms locally (17 to 20 ms before a run's best went through Daniels' cost of
 * its speed, so that adds nothing measurable): both sports read the same estimate since the run threshold replaced the run's
 * fit, which cost about 3 ms. The budget is about half again that, so pricing every activity again for every week, or
 * preparing a window's activities afresh in each, fails it.
 */
const BUDGET_MS = 30
const ACTIVITIES = 2000
/**
 * With heart rate each sport that reads it has its activities read once, its heart-rate line fitted once over their blocks (the
 * rides' 16,000), and each of the 230 weeks costs one estimate against it: about 31 ms here (35 ms in the suite's run), all of it
 * the rides'. A run reads pace alone, so no line is fitted for it: with its line the same library took about 43 ms, and the rides
 * alone 22 ms before the run threshold existed. Fitting the line for every week, as the first wiring did, took about 3 s; the
 * budget is twice the cost, so a line fitted per window fails it by a wide margin.
 */
const HEART_RATE_BUDGET_MS = 70

describe('thresholdTimeline performance', () => {
  const base = sampleDataset().activities.map((activity) => digestActivity(activity))
  const library: ActivityDigest[] = Array.from({ length: ACTIVITIES }, (_, i) => {
    const source = base[i % base.length]!
    return Object.assign({}, source, {
      id: `a${i}`,
      startMs: source.startMs + Math.floor(i / base.length) * 10 * DAY_MS,
    })
  })
  const settings = { massKg: 75, bikeMassKg: 9 }
  const ordered = orderedCurrent(library)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model

  it(`works out ${ACTIVITIES} activities in under ${BUDGET_MS} ms`, () => {
    const ms = fastestMs(() => thresholdTimeline(ordered, masses, bikeModel, null), 3)

    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it(`works out ${ACTIVITIES} activities with heart rate, line and all, in under ${HEART_RATE_BUDGET_MS} ms`, () => {
    const effort = { referenceHr: { run: 182, ride: 176 }, setAside: new Set<string>() }
    let timeline = thresholdTimeline(ordered, masses, bikeModel, null, effort)
    const ms = fastestMs(() => {
      timeline = thresholdTimeline(ordered, masses, bikeModel, null, effort)
    }, 3)

    // The line was fitted and read: the work timed is the heart rate's too, not the power alone.
    expect(timeline.ride.length).toBeGreaterThan(100)
    expect(ms).toBeLessThan(HEART_RATE_BUDGET_MS)
  })
})

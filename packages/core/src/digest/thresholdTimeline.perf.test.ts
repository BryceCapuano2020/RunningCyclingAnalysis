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
 * once and the window's best moves with it as the weeks pass. On 2,000 activities, about ten a week for four years, it
 * takes about 3 ms locally; the budget is ten times that, so merging every digest of the window for every week (which
 * took 36 ms), or fitting a week per activity, fails it.
 */
const BUDGET_MS = 30
const ACTIVITIES = 2000
/**
 * With heart rate the library's rides are read once, the heart-rate line is fitted once over their 16,000 blocks, and each of
 * the 230 weeks costs one estimate against it: about 22 ms here. Fitting the line for every week, as the first wiring did, took
 * about 3 s; the budget is twice the cost, so a line fitted per window fails it by a wide margin.
 */
const HEART_RATE_BUDGET_MS = 45

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

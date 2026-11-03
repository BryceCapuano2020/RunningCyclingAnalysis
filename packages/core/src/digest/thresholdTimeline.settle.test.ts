import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL } from '../constants'
import { SETTLE_DAYS, settledThresholds } from '../zones/settleThresholds'
import { digestActivity } from './digestActivity'
import { fixedMasses } from './masses'
import { syntheticActivity } from './test/syntheticActivity'
import { thresholdTimeline } from './thresholdTimeline'
import { thresholdAt } from './thresholdTimelineTypes'
import type { ActivityDigest } from '../types'

/*
 * The zones follow the ride threshold through the settle rule (zones/settleThresholds.ts): a window's threshold has to differ
 * from the one held by more than its own standard error, and stand for two weeks. A rider whose level really rises 5% has to
 * be believed once the rise has held, so the standard error of a window is the power estimate's own, not the width of the range.
 */

const START_MS = Date.UTC(2024, 0, 1, 12)
const WEEK_MS = 7 * DAY_MS
const masses = fixedMasses(70, 9)
const BASE_W = 250

/** An hour's ride with 20 minutes hard at `BASE_W`: its bests from 3 to 20 min are the hard minutes'. */
const BASE: ActivityDigest = (() => {
  const n = 3600
  const power = Float64Array.from({ length: n }, (_, i) => (i < 1200 ? BASE_W : 140))
  return digestActivity(
    syntheticActivity({
      id: 'base',
      sport: 'ride',
      n,
      startMs: START_MS,
      speed: new Float64Array(n).fill(8),
      power,
    }),
  )
})()

/** A ride a week for `weeks` weeks from `fromWeek`, whose efforts are `level` times the base ride's. */
function weeklyRides(fromWeek: number, weeks: number, level: number): ActivityDigest[] {
  return Array.from({ length: weeks }, (_, i) =>
    Object.assign({}, BASE, {
      id: `ride-${fromWeek + i}`,
      startMs: START_MS + (fromWeek + i) * WEEK_MS,
      curve: BASE.curve.map((point) =>
        Object.assign({}, point, { value: point.value === null ? null : point.value * level }),
      ),
    }),
  )
}

describe('the zones of a rider whose ride threshold rises 5%', () => {
  // 30 weeks at one level, then 30 weeks at 5% more.
  const library = [...weeklyRides(0, 30, 1), ...weeklyRides(30, 30, 1.05)]
  const { ride } = thresholdTimeline(library, masses, DEFAULT_BIKE_MODEL, null)
  const before = thresholdAt(ride, START_MS + 20 * WEEK_MS)!.fit
  /** The zones' threshold at `nowMs`, with the steps settled as of it. */
  const zonesAt = (nowMs: number) =>
    thresholdAt(settledThresholds({ run: [], ride }, nowMs).ride, nowMs)!.fit.cp

  it('gives a window an error of the power estimate’s, not the width of its range', () => {
    expect(before.cpSe! / before.cp).toBeGreaterThanOrEqual(0.025)
    expect(before.cpSe! / before.cp).toBeLessThan(0.03)
  })

  it('moves the zones off the old level after the hold period, and not before it', () => {
    // The first window to read the rise by more than its error.
    const risen = ride.find((step) => step.fit !== null && step.fit.cp > before.cp + before.cpSe!)!
    expect(risen).toBeDefined()
    // Mid-week, as its window opens: a hard effort that has just entered does not move today's zones.
    const entered = risen.fromMs - 3 * DAY_MS
    expect(zonesAt(entered)).toBeCloseTo(before.cp, 6)
    const held = zonesAt(entered + SETTLE_DAYS * DAY_MS)
    expect(held).toBeCloseTo(risen.fit!.cp, 6)
    expect(held / before.cp).toBeGreaterThan(1.02)
  })

  it('stays within one error of the new level for as long as it holds', () => {
    const last = ride.findLast((step) => step.fit !== null)!
    const settled = zonesAt(last.fromMs)
    expect(settled / before.cp).toBeGreaterThan(1.02)
    expect(Math.abs(settled - last.fit!.cp) / last.fit!.cp).toBeLessThanOrEqual(0.025)
  })
})

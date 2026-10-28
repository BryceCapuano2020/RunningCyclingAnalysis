import { describe, expect, it } from 'vitest'
import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { encodeGpx } from '../gpx/encode'
import { parseGpx } from '../gpx/parse'
import { runCost } from '../metabolic'
import type { Activity, ActivityDigest } from '../types'
import { agreedStreams } from './agreement'
import { assessQuality } from './assess'

/** Cumulative distance from per-second metres. */
function cumulative(steps: ArrayLike<number>): Float64Array {
  const out = new Float64Array(steps.length)
  for (let i = 1; i < steps.length; i++) out[i] = out[i - 1]! + steps[i]!
  return out
}

/** A run of n seconds at `speedMs` whose recorded distance gains `recordedMs(i)` each second. */
function runWith(n: number, speedMs: number, recordedMs: (i: number) => number, grade = 0) {
  const base = syntheticActivity({ id: 'r', n, speed: new Float64Array(n).fill(speedMs), grade })
  const distance = cumulative(Array.from({ length: n }, (_, i) => recordedMs(i)))
  return { ...base, distance }
}

const valueAt = (d: ActivityDigest, durationS: number) =>
  d.curve.find((p) => p.durationS === durationS)!.value

const steadyCost = (speedMs: number, grade: number) =>
  RESTING_W_PER_KG + PRIORS.runEconomyScale.mean * runCost(grade) * speedMs

describe('agreedStreams', () => {
  it('returns the streams themselves when they agree', () => {
    const run = runWith(600, 3, () => 3)
    const agreed = agreedStreams(run)
    expect(agreed.stretches).toEqual([])
    expect(agreed.speed).toBe(run.speed)
    expect(agreed.distance).toBe(run.distance)
  })

  it('ignores GPS noise: a recorded distance jittering 30% about the speed each second', () => {
    // Alternating 2.1 and 3.9 m/s around a steady 3 m/s agrees over any 30 s.
    const run = runWith(1200, 3, (i) => (i % 2 === 0 ? 2.1 : 3.9))
    expect(agreedStreams(run).stretches).toEqual([])
    expect(assessQuality(run).flags).toEqual([])
  })

  it('ignores a runner standing still while the GPS drifts', () => {
    // Speed 0.3 m/s (still) against 1 m/s of drift: the speed covers under 15 m in 30 s.
    const run = runWith(600, 0.3, () => 1)
    expect(agreedStreams(run).stretches).toEqual([])
  })

  it('scales the speed down to the recorded distance where the speed reads three times it', () => {
    const run = runWith(900, 3, (i) => (i >= 400 && i < 520 ? 1 : 3))
    const agreed = agreedStreams(run)
    expect(agreed.stretches.length).toBe(1)
    // Fully inside the stretch the speed is the recorded 1 m/s; well outside it is untouched.
    expect(agreed.speed[460]).toBeCloseTo(1, 9)
    expect(agreed.speed[100]).toBe(3)
    expect(agreed.speed[800]).toBe(3)
    // The recorded distance is lower here, so it is kept as it is.
    expect(agreed.distance).toEqual(run.distance)
  })

  it('scales the distance down to the speed where the recorded distance jumps ahead', () => {
    // 20 s of GPS jumps at 12 m/s while the speed reads a steady 3 m/s.
    const run = runWith(900, 3, (i) => (i >= 400 && i < 420 ? 12 : 3))
    const agreed = agreedStreams(run)
    expect(agreed.stretches.length).toBe(1)
    expect(agreed.distance[419]! - agreed.distance[399]!).toBeLessThan(20 * 3 * 1.01)
    expect(agreed.speed).toEqual(run.speed)
  })

  it('does not compare across a pause or a recording gap', () => {
    const run: Activity = runWith(900, 3, (i) => (i >= 400 && i < 520 ? 1 : 3))
    run.paused.fill(1, 380, 540)
    expect(agreedStreams(run).stretches).toEqual([])
  })
})

describe('the digest where the streams disagree', () => {
  it('credits a 120 s stairs climb at the recorded pace, not the speed that reads three times it', () => {
    // Altitude rises 0.25 m/s on the stairs: 0.25 grade over the recorded 1 m/s.
    const n = 900
    const onStairs = (i: number) => i >= 600 && i < 720
    const run = runWith(n, 3, (i) => (onStairs(i) ? 1 : 3))
    let climbed = 0
    run.altitude = Float64Array.from(
      { length: n },
      (_, i) => 100 + (onStairs(i) ? (climbed += 0.25) : climbed),
    )
    const d = digestActivity(run)
    expect(d.flagCounts['stream-disagreement']).toBe(1)
    // Believing the speed, the stairs would be 3 m/s up a 0.25/3 grade. At the recorded 1 m/s up
    // 25% they are worth less than the 3 m/s flat, so the 60 s best is the flat, but for the grade
    // the smoothing carries onto the flat beside the stairs.
    expect(steadyCost(1, 0.25)).toBeLessThan(steadyCost(3, 0))
    expect(valueAt(d, 60)).toBeLessThan(1.05 * steadyCost(3, 0))
    expect(valueAt(d, 60)).toBeLessThan(0.75 * steadyCost(3, 0.25 / 3))
  })

  it('keeps a GPS jump out of the distance bests', () => {
    const run = runWith(900, 3, (i) => (i >= 400 && i < 420 ? 12 : 3))
    const mile = digestActivity(run).distanceBests!.find((b) => b.distanceM === 1609.344)!
    expect(mile.seconds).toBeCloseTo(1609.344 / 3, 0)
  })

  it('leaves a genuine fast flat effort alone when both streams agree', () => {
    // Five minutes at 6 m/s (4:28 per mile) inside an easy run, recorded alike by both streams.
    const n = 1500
    const fast = (i: number) => i >= 600 && i < 900
    const speed = Float64Array.from({ length: n }, (_, i) => (fast(i) ? 6 : 3))
    const run = { ...syntheticActivity({ id: 'fast', n, speed }) }
    const d = digestActivity(run)
    expect(d.flags).toEqual([])
    expect(valueAt(d, 300)).toBeCloseTo(steadyCost(6, 0), 9)
  })

  it('never touches a GPX file, whose distance comes from its positions as its speed does', () => {
    const n = 900
    const speed = Float64Array.from({ length: n }, (_, i) => (i >= 400 && i < 520 ? 1.2 : 3.5))
    const result = parseGpx(
      encodeGpx(
        syntheticActivity({ id: 'g', n, speed, grade: 0.03, startMs: Date.UTC(2025, 0, 1) }),
      ),
      'g.gpx',
    )
    if (!result.ok) throw new Error('the encoded GPX did not parse')
    const parsed = result.activities[0]!
    expect(agreedStreams(parsed).stretches).toEqual([])
    expect(digestActivity(parsed).flagCounts['stream-disagreement']).toBeUndefined()
  })
})

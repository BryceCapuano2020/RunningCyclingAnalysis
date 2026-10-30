import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import type { ActivityDigest } from '../types'
import { referenceMaxOf } from './referenceMax'

/**
 * The rule for a reference maximum heart rate, chosen by sweeping synthetic athletes against the alternatives.
 * Each library is one athlete's per-day peak heart rates (the digest's 30 s mean), with a true maximum that may
 * fall with age, and the failures of a wrist sensor: a sustained reading far above the body's, a sensor stuck at one
 * whole number, a cadence lock that holds a reading near 160 to 185, and a strap that reads a few beats high. Every
 * figure is the error of an estimate against the true maximum on the last day, in bpm.
 *
 * What the sweep showed, as mean error in bpm over 400 athletes a row (the rule shipped / the plain maximum / the third
 * highest day of all time):
 *   clean, 300 days                                    1.0 / 2.8 / 1.6
 *   2% of days spike, 0.2% stuck, 5% cadence lock      4.6 / 36.0 / 26.2
 *   1% of days spike, 1% stuck                         1.3 / 35.8 / 27.3
 *   15% of days cadence-locked, 1% spike               2.7 / 30.1 / 13.0
 *   120 days, 2% spike                                 2.7 / 26.6 / 9.0
 *   30 days, 3% spike                                  7.5 / 14.8 / 5.2
 * The plain maximum is one artefact from wrong. The third highest day alone is wrong when a few spikes land in
 * the window, because it takes the third of them, and it ignores a maximum that falls with age. Asking three days to
 * agree to within a few beats near the top of the days, over a trailing window, ignoring days that repeat a whole
 * number, keeps the error of a clean library and cuts the error of a spiky one by 4 or more. A thin library has too few
 * hard days to tell a spike from them, and there the third highest day does better, at the cost of an underestimate on
 * the clean thin libraries the second highest does not make. A library of 5% spiking days is beyond any rule that looks
 * only at the maxima.
 */

interface Scenario {
  name: string
  days: number
  years: number
  /** The share of days with a sustained reading 4 to 20% above the true maximum. */
  spike: number
  /** The share of days with the sensor stuck at one whole number. */
  ceiling: number
  /** The share of days with a cadence lock near 160 to 185. */
  lock: number
  bias: number
  /**
   * Seconds a sensor holds a reading before it updates, 1 for one that updates every second. A hold of half a minute
   * or more makes the 30 s mean of a plateau a whole number.
   */
  hold?: number
  /** The fall of the true maximum, bpm a year. */
  decline: number
}

function random(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (r: () => number, low: number, high: number) => low + (high - low) * r()
const START = Date.UTC(2020, 0, 1, 12)

/**
 * The 30 s mean peak of a 7 minute plateau around `target` bpm that a sensor reports in whole beats, holding each
 * reading for `hold` seconds. With a long hold the best 31 samples are one reading repeated, so the peak is a whole number.
 */
function heldPeak(r: () => number, target: number, hold: number): number {
  const length = 420
  const hr: number[] = []
  let value = target
  for (let i = 0; i < length; i++) {
    if (i % hold === 0) value = Math.round(target + (r() - 0.5) * 4)
    hr.push(value)
  }
  let best = -Infinity
  for (let i = 15; i < length - 15; i++) {
    let sum = 0
    for (let j = i - 15; j <= i + 15; j++) sum += hr[j]!
    best = Math.max(best, sum / 31)
  }
  return best
}

function library(scenario: Scenario, seed: number) {
  const r = random(seed)
  const start = between(r, 170, 205)
  const span = scenario.years * 365
  const days = new Set<number>()
  while (days.size < scenario.days) days.add(Math.floor(r() * span))
  const ceiling = Math.round(between(r, 205, 220))
  const lock = between(r, 160, 185)
  const digests = [...days]
    .sort((a, b) => a - b)
    .map((day, i): ActivityDigest => {
      const max = start - (scenario.decline * day) / 365
      const u = r()
      // Three in a hundred days are all-out, fifteen in a hundred hard, and the rest easy to moderate.
      let bpm =
        u < 0.03
          ? max * between(r, 0.985, 1)
          : u < 0.18
            ? max * between(r, 0.93, 0.985)
            : max * between(r, 0.68, 0.92)
      bpm += scenario.bias
      if (scenario.hold !== undefined && scenario.hold > 1) bpm = heldPeak(r, bpm, scenario.hold)
      if (r() < scenario.lock) bpm = Math.max(bpm, lock + between(r, -2, 2))
      if (r() < scenario.spike) bpm = max * between(r, 1.04, 1.2)
      if (r() < scenario.ceiling) bpm = ceiling
      return {
        id: `d${i}`,
        sport: 'run',
        startMs: START + day * DAY_MS,
        maxHeartRate: bpm,
      } as ActivityDigest
    })
  return { digests, truth: start - scenario.decline * scenario.years }
}

const plainMax = (digests: ActivityDigest[]) => Math.max(...digests.map((d) => d.maxHeartRate!))
const thirdHighestDay = (digests: ActivityDigest[]) => {
  const byDay = new Map<number, number>()
  for (const d of digests) {
    const day = Math.floor(d.startMs / DAY_MS)
    byDay.set(day, Math.max(byDay.get(day) ?? -Infinity, d.maxHeartRate!))
  }
  return [...byDay.values()].sort((a, b) => b - a)[2]!
}
const shipped = (digests: ActivityDigest[]) =>
  referenceMaxOf(digests, Math.max(...digests.map((d) => d.startMs)))!.bpm

function meanError(scenario: Scenario, estimate: (digests: ActivityDigest[]) => number, n = 150) {
  let total = 0
  let signed = 0
  for (let seed = 0; seed < n; seed++) {
    const { digests, truth } = library(scenario, 9000 + seed)
    const error = estimate(digests) - truth
    total += Math.abs(error)
    signed += error
  }
  return { mean: total / n, bias: signed / n }
}

const BASE: Scenario = {
  name: 'clean',
  days: 300,
  years: 6,
  spike: 0,
  ceiling: 0,
  lock: 0,
  bias: 0,
  decline: 0.7,
}

describe('the reference maximum, against the alternatives', () => {
  it('is as close as the plain maximum or closer on a clean library', () => {
    expect(meanError(BASE, shipped).mean).toBeLessThan(1.5)
    expect(meanError(BASE, shipped).mean).toBeLessThanOrEqual(meanError(BASE, plainMax).mean)
  })

  it('keeps its error to a few beats when 2% of days spike, where the maximum is off by tens', () => {
    const scenario = { ...BASE, spike: 0.02, ceiling: 0.002, lock: 0.05 }
    const [rule, max, third] = [shipped, plainMax, thirdHighestDay].map((f) =>
      meanError(scenario, f),
    )
    expect(rule!.mean).toBeLessThan(6)
    expect(max!.mean).toBeGreaterThan(20)
    expect(third!.mean).toBeGreaterThan(rule!.mean * 2)
  })

  it('shrugs off a few old spikes, which the third highest day alone only half does', () => {
    const scenario = { ...BASE, spike: 0.01, ceiling: 0.01 }
    expect(meanError(scenario, shipped).mean).toBeLessThan(2)
    expect(meanError(scenario, thirdHighestDay).mean).toBeGreaterThan(
      meanError(scenario, shipped).mean * 2,
    )
  })

  it('is not led by a cadence lock on 15% of the days', () => {
    const scenario = { ...BASE, spike: 0.01, lock: 0.15 }
    expect(meanError(scenario, shipped).mean).toBeLessThan(4)
  })

  it('reads a strap that is 4 bpm high as 4 bpm high, since nothing says it is', () => {
    const { bias } = meanError({ ...BASE, bias: 4 }, shipped)
    expect(bias).toBeGreaterThan(2.5)
    expect(bias).toBeLessThan(5.5)
  })

  it('is not lost to a sensor that holds each reading for 40 s, which makes whole-number peaks of real ones', () => {
    // Many days then share a whole number at the top. Dropping every copy of a tied number left the maximum at the next
    // lower, near 25 bpm low on average; one representative of each keeps it.
    const scenario = { ...BASE, hold: 40, spike: 0.005 }
    expect(meanError(scenario, shipped).mean).toBeLessThan(4)
    expect(meanError(scenario, shipped).bias).toBeGreaterThan(-3)
  })

  it('follows a maximum that does not fall with age as closely as one that does', () => {
    const steady = meanError({ ...BASE, decline: 0 }, shipped).mean
    expect(steady).toBeLessThan(2.5)
  })

  it('holds up from 60 days on, and beats the maximum below that', () => {
    const middle = { ...BASE, days: 120, years: 3, spike: 0.02, lock: 0.05 }
    expect(meanError(middle, shipped).mean).toBeLessThan(5)
    const thin = { ...BASE, days: 30, years: 2, spike: 0.03, lock: 0.05 }
    expect(meanError(thin, shipped).mean).toBeLessThan(meanError(thin, plainMax).mean / 1.5)
  })
})

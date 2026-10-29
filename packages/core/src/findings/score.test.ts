import { describe, expect, it } from 'vitest'
import { mulberry32, normal } from '../math'
import {
  adjustedSurprise,
  barRejection,
  confidenceOf,
  continuationOf,
  fingerprintOf,
  materiallyChanged,
  signOf,
  surpriseInputOf,
  surpriseOf,
  surpriseReading,
  surprisesOf,
} from './score'
import type { Support } from './types'

const support = (over: Partial<Support> = {}): Support => ({
  sign: { kind: 'agree', share: 0.95 },
  n: 10,
  nNeeded: 10,
  robust: true,
  ...over,
})

const WEEK_MS = 7 * 86_400_000

describe('confidenceOf', () => {
  it('is the sign confidence of the bootstrap share when supported and robust', () => {
    expect(confidenceOf(support())).toBeCloseTo(0.9, 12)
  })

  it('scales with the activities it has against the activities it needs', () => {
    expect(confidenceOf(support({ n: 5 }))).toBeCloseTo(0.45, 12)
    expect(confidenceOf(support({ n: 40 }))).toBeCloseTo(0.9, 12)
  })

  it('halves when one activity carries the sign', () => {
    expect(confidenceOf(support({ robust: false }))).toBeCloseTo(0.45, 12)
  })

  it('reads a z through the normal curve, and honours a detector cap', () => {
    // 2 Phi(2.2) - 1 = 0.9722 (SciPy: norm.cdf(2.2) = 0.98610)
    expect(confidenceOf(support({ sign: { kind: 'z', z: 2.2 } }))).toBeCloseTo(0.9722, 4)
    expect(confidenceOf(support({ sign: { kind: 'z', z: 2.2 }, cap: 0.85 }))).toBe(0.85)
  })

  it('is zero for a coin flip or a number that is not one', () => {
    expect(confidenceOf(support({ sign: { kind: 'agree', share: 0.5 } }))).toBe(0)
    expect(confidenceOf(support({ sign: { kind: 'z', z: Number.NaN } }))).toBe(0)
  })
})

describe('surprise', () => {
  // Alternating +-1 has a median absolute deviation of 1, so its spread is 1.4826.
  const noise = Array.from({ length: 26 }, (_, i) => (i % 2 === 0 ? 1 : -1))
  const value = (input: Parameters<typeof surpriseReading>[0]) => surpriseReading(input).value

  it('is half the z term and half the rarity with a full history', () => {
    // effect 2.2239 = 1.5 spreads: z term 0.5. 15 of 30 past comparisons moved less: rarity 0.5.
    const past = [...Array.from({ length: 15 }, () => 0.5), ...Array.from({ length: 15 }, () => 4)]
    expect(value({ effect: 1.5 * 1.4826, noise, past })).toBeCloseTo(0.5, 10)
    expect(surpriseReading({ effect: 1.5 * 1.4826, noise, past }).z).toBeCloseTo(1.5, 10)
    expect(value({ effect: 1.5 * 1.4826, noise, past: past.map((p) => -p) })).toBeCloseTo(0.5, 10)
  })

  it('reaches 1 for an effect beyond three spreads that nothing in the past matched', () => {
    expect(value({ effect: 5, noise, past: Array.from({ length: 30 }, () => 1) })).toBe(1)
  })

  it('has only the z term, capped at 0.6, with under 26 weeks of past', () => {
    const short = Array.from({ length: 12 }, () => 0.5)
    expect(value({ effect: 1.5 * 1.4826, noise, past: short })).toBeCloseTo(0.5, 10)
    expect(value({ effect: 5, noise, past: short })).toBe(0.6)
  })

  it('measures from what is usual, the median of the previous 26: a steady ramp is not surprising', () => {
    // Every comparison is about 5.0 give or take 1: the effect of 5.0 is what it has always been.
    const usual = Array.from({ length: 26 }, (_, i) => 5 + (i % 2 === 0 ? 1 : -1))
    expect(value({ effect: 5, noise: usual, past: usual })).toBeLessThan(0.3)
    // The same history with an effect of 11 (6 above usual, 4 spreads) is a step out of it.
    expect(value({ effect: 11, noise: usual, past: usual })).toBe(1)
    // And an effect of -1, as far below usual, is as surprising: the direction does not matter.
    expect(value({ effect: -1, noise: usual, past: usual })).toBe(1)
  })

  it('asks the effect to be 2.5 spreads from usual to start, whatever its rarity', () => {
    const past = Array.from({ length: 30 }, () => 0.1)
    // 2 spreads out, rarer than all of the past: the formula says 0.5 * 0.667 + 0.5 = 0.83, the gate says no.
    const two = { effect: 2 * 1.4826, noise, past }
    expect(value(two)).toBeCloseTo(0.5 * (2 / 3) + 0.5, 10)
    expect(surpriseOf(two)).toBe(0)
    expect(surprisesOf(two)).toEqual({ entering: 0, staying: value(two) })
    const three = { effect: 3 * 1.4826, noise, past }
    expect(surpriseOf(three)).toBe(1)
    expect(surprisesOf(three)).toEqual({ entering: 1, staying: 1 })
  })

  it('cannot judge a spread from fewer than 8 changes, or without an input', () => {
    expect(surpriseOf({ effect: 5, noise: noise.slice(0, 7), past: [] })).toBe(0)
    expect(surpriseOf(null)).toBe(0)
    expect(surpriseOf({ effect: Number.NaN, noise, past: [] })).toBe(0)
  })

  it('treats a constant history as surprised by any change, unless a smallest spread says otherwise', () => {
    const flat = Array.from({ length: 26 }, () => 0)
    const past = Array.from({ length: 30 }, () => 0)
    expect(surpriseOf({ effect: 0.01, noise: flat, past })).toBe(1)
    expect(value({ effect: 0.01, noise: flat, past, minSd: 0.1 })).toBeCloseTo(
      0.5 * (0.1 / 3) + 0.5,
      6,
    )
    expect(surpriseOf({ effect: 0.01, noise: flat, past, minSd: 0.1 })).toBe(0)
    expect(surpriseOf({ effect: 0, noise: flat, past })).toBe(0)
  })
})

describe('surpriseInputOf', () => {
  it('compares the latest week with the one lagWeeks before, and every earlier week the same way', () => {
    const weekly = [1, 2, 3, 4, 5, 6, 7, 8, 10]
    const input = surpriseInputOf(weekly, 3)!
    expect(input.effect).toBe(4)
    expect(input.past).toEqual([3, 3, 3, 3, 3])
    expect(input.noise).toEqual(input.past)
  })

  it('keeps the last 26 as noise, skips missing weeks, and has none without the lag', () => {
    const long = Array.from({ length: 80 }, (_, i) => i)
    const input = surpriseInputOf(long, 8)!
    expect(input.noise).toHaveLength(26)
    expect(input.past).toHaveLength(71)
    const gap = [1, Number.NaN, 3, 4, 5]
    expect(surpriseInputOf(gap, 2)!.past).toEqual([2])
    expect(surpriseInputOf([1, 2], 3)).toBeNull()
    expect(surpriseInputOf([1, Number.NaN, 3], 2)!.effect).toBe(2)
    expect(surpriseInputOf([Number.NaN, 2, 3], 2)).toBeNull()
  })
})

describe('continuation', () => {
  const now = 100 * WEEK_MS
  const shown = [{ id: 'a', sign: 1 as const, atMs: now - 3 * WEEK_MS }]

  it('is new without a sighting in the last 12 weeks', () => {
    expect(continuationOf('b', 1, now, shown)).toBe('new')
    expect(continuationOf('a', 1, now, [{ id: 'a', sign: 1, atMs: now - 13 * WEEK_MS }])).toBe(
      'new',
    )
    expect(continuationOf('a', 1, now, [{ id: 'a', sign: 1, atMs: now }])).toBe('new')
  })

  it('is continued for the same sign and a reversal for the opposite, by the newest sighting', () => {
    expect(continuationOf('a', 1, now, shown)).toBe('continued')
    expect(continuationOf('a', -1, now, shown)).toBe('reversal')
    const flipped = [...shown, { id: 'a', sign: -1 as const, atMs: now - 1 * WEEK_MS }]
    expect(continuationOf('a', 1, now, flipped)).toBe('reversal')
  })

  it('damps a repeat to 0.4 and lifts a reversal by 1.25, to at most 1', () => {
    expect(adjustedSurprise(0.8, 'continued')).toBeCloseTo(0.32, 12)
    expect(adjustedSurprise(0.8, 'reversal')).toBe(1)
    expect(adjustedSurprise(0.6, 'reversal')).toBeCloseTo(0.75, 12)
    expect(adjustedSurprise(0.8, 'new')).toBe(0.8)
  })
})

describe('barRejection', () => {
  const both = (value: number) => ({ entering: value, staying: value })

  it('needs confidence 0.80 and surprise 0.40 to start, both at the edge', () => {
    expect(barRejection(0.8, both(0.4), false)).toBeNull()
    expect(barRejection(0.799, both(0.9), false)).toBe('confidence')
    expect(barRejection(0.9, both(0.399), false)).toBe('surprise')
  })

  it('starts on the surprise that needed the effect to be far from usual, not the one that did not', () => {
    expect(barRejection(0.9, { entering: 0, staying: 0.9 }, false)).toBe('surprise')
  })

  it('lets a finding already being spoken stay down to 0.25 of the plain surprise, and still needs its confidence', () => {
    expect(barRejection(0.9, { entering: 0, staying: 0.3 }, true)).toBeNull()
    expect(barRejection(0.9, { entering: 0, staying: 0.25 }, true)).toBeNull()
    expect(barRejection(0.9, { entering: 0.9, staying: 0.249 }, true)).toBe('surprise')
    expect(barRejection(0.79, both(0.9), true)).toBe('confidence')
  })
})

describe('surprise of a ramp, a step and a reversal', () => {
  // Weekly series with a little noise (seeded), compared with itself 8 weeks earlier.
  const noise = (seed: number, n: number) => {
    const random = mulberry32(seed)
    return Array.from({ length: n }, () => 0.004 * normal(random))
  }
  const ramp = (slope: number, turn: number | null) =>
    noise(5, 60).map((e, i) =>
      turn === null || i <= turn ? slope * i + e : slope * turn - slope * (i - turn) + e,
    )
  const surpriseAt = (series: number[], end: number) =>
    surprisesOf(surpriseInputOf(series.slice(0, end + 1), 8)).entering

  it('makes a steady ramp unsurprising in nearly every week however big it grows', () => {
    // The ramp is 8 x 0.01 = 8% over every 8 weeks. Judged from zero, as before centring, every week
    // was a z of 8 and a surprise of 1. Rarity alone is a percentile of the past, which is even from 0
    // to 1 in a history where nothing changes, so the formula without the distance called half the
    // weeks surprising; with it, only the excursions of noise 2.5 spreads out are.
    const series = ramp(0.01, null)
    expect(Math.abs(surpriseInputOf(series, 8)!.effect)).toBeGreaterThan(0.06)
    const ends = Array.from({ length: 40 }, (_, i) => 20 + i)
    const entering = ends.filter(
      (end) => surprisesOf(surpriseInputOf(series.slice(0, end + 1), 8)).entering >= 0.4,
    )
    expect(entering.length).toBeLessThanOrEqual(2)
    // While the plain formula would have called many of them surprising.
    const plain = ends.filter(
      (end) => surpriseReading(surpriseInputOf(series.slice(0, end + 1), 8)).value >= 0.4,
    )
    expect(plain.length).toBeGreaterThan(10)
  })

  it('scores a step as surprising while it is in the eight weeks, and a flat series before it as not', () => {
    const flat = noise(5, 60)
    const step = flat.map((e, i) => e + (i >= 50 ? 0.08 : 0))
    expect(surpriseAt(step, 55)).toBeGreaterThan(0.9)
    expect(surpriseAt(step, 45)).toBeLessThan(0.5)
  })

  it('scores a reversal of a ramp higher than the ramp going on, the same size either way', () => {
    const goingOn = surpriseAt(ramp(0.01, null), 59)
    const reversed = surpriseAt(ramp(0.01, 46), 59)
    expect(reversed).toBeGreaterThan(goingOn + 0.3)
    expect(reversed).toBeGreaterThan(0.6)
  })
})

describe('identity', () => {
  it('has a sign and a fingerprint that moves with the sign and the effect by steps of half', () => {
    expect(signOf(-0.2)).toBe(-1)
    expect(signOf(0)).toBe(0)
    expect(fingerprintOf('x:run:y', 0.05)).toBe(fingerprintOf('x:run:y', 0.052))
    expect(fingerprintOf('x:run:y', 0.05)).not.toBe(fingerprintOf('x:run:y', 0.1))
    expect(fingerprintOf('x:run:y', 0.03)).not.toBe(fingerprintOf('x:run:y', -0.03))
    expect(fingerprintOf('x:run:y', 0)).toBe('x:run:y|0|none')
  })

  it('shows a finding again when its effect moved by half of what was shown, or changed sign', () => {
    expect(materiallyChanged(0.04, 0.05)).toBe(false)
    expect(materiallyChanged(0.04, 0.059)).toBe(false)
    expect(materiallyChanged(0.04, 0.061)).toBe(true)
    expect(materiallyChanged(0.04, 0.02)).toBe(true)
    expect(materiallyChanged(0.04, 0.021)).toBe(false)
    expect(materiallyChanged(0.04, -0.04)).toBe(true)
    expect(materiallyChanged(-6, -8)).toBe(false)
    expect(materiallyChanged(-6, -9)).toBe(true)
    expect(materiallyChanged(0, 0.01)).toBe(true)
  })
})

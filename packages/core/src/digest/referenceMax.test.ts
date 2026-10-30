import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import type { ActivityDigest, Sport } from '../types'
import {
  MIN_WINDOW_DAYS,
  REFERENCE_WINDOW_DAYS,
  THIN_LIBRARY_DAYS,
  newestHeartRateMs,
  referenceMaxOf,
} from './referenceMax'

const START = Date.UTC(2023, 0, 2, 12)

/** A digest with the fields the maximum reads: the day it was on (counted from the library's first), its sport and its peak. */
function digest(day: number, maxHeartRate: number | null, sport: Sport = 'run', hour = 0) {
  return {
    id: `${sport}-${day}-${hour}`,
    sport,
    startMs: START + day * DAY_MS + hour * 3_600_000,
    maxHeartRate,
  } as unknown as ActivityDigest
}

/**
 * A runner's year: every day an easy or moderate run between 150 and 178 bpm, and on `hard` days the peaks of hard
 * sessions near the true maximum, a few bpm apart.
 */
function season(days: number, hard: readonly number[], offset = 0): ActivityDigest[] {
  const out: ActivityDigest[] = []
  for (let d = 0; d < days; d++) out.push(digest(offset + d, 150 + ((d * 7) % 29) + 0.37))
  hard.forEach((peak, i) => out.push(digest(offset + 5 + i * 11, peak)))
  return out
}

const end = (digests: ActivityDigest[]) => newestHeartRateMs(digests)
const bpmOf = (digests: ActivityDigest[]) => referenceMaxOf(digests, end(digests))?.bpm ?? null

// The true maximum of the runner below is 190; hard sessions reach it to within a few beats.
const HARD = [188.4, 190.2, 189.1, 187.3, 189.8, 188.9]

describe('referenceMaxOf', () => {
  it('is the highest value three separate days reached, near the top of the days', () => {
    const library = season(200, HARD)
    // 190.2, 189.8 and 189.1 are the top three days, within 3 bpm of each other.
    expect(bpmOf(library)).toBeCloseTo(189.1, 9)
    expect(referenceMaxOf(library, end(library))?.days).toBe(3)
  })

  it('is not moved by one, two or three spikes, which are far above and apart from each other', () => {
    const clean = bpmOf(season(200, HARD))
    for (const spikes of [[231.6], [231.6, 214.3], [231.6, 214.3, 207.9]]) {
      const library = [
        ...season(200, HARD),
        ...spikes.map((value, i) => digest(150 + i * 3, value)),
      ]
      expect(bpmOf(library)).toBe(clean)
    }
  })

  it('does not let days that read the same whole number corroborate each other', () => {
    // A sensor stuck at its ceiling reads 210 exactly on three days; a sustained mean never does.
    const library = [...season(200, HARD), digest(120, 210), digest(130, 210), digest(140, 210)]
    expect(bpmOf(library)).toBeCloseTo(189.1, 9)
  })

  it('leaves out spikes older than the window, even when they agree', () => {
    const old = [digest(0, 209.1), digest(2, 210.4), digest(4, 211.2)]
    const recent = season(300, HARD, 1500)
    const library = [...old, ...recent]
    expect(bpmOf(library)).toBeCloseTo(189.1, 9)
    // Within the window the same three would count, which is what three agreeing days are.
    const together = [...season(300, HARD), ...old.map((d, i) => digest(40 + i, d.maxHeartRate))]
    expect(bpmOf(together)).toBeGreaterThan(209)
  })

  it('is not taken from a stretch near 175 that a sensor locked onto a cadence', () => {
    // Four in ten runs hold a reading of 172 to 176 for minutes, as cadence lock does; the real peaks are higher.
    const library = [
      ...season(200, HARD),
      ...Array.from({ length: 80 }, (_, i) => digest(i * 2 + 1, 172 + (i % 5), 'run', 6)),
    ]
    expect(bpmOf(library)).toBeCloseTo(189.1, 9)
  })

  it('follows a strap that reads high, since nothing in the readings says it does', () => {
    const library = season(200, HARD).map((d) =>
      Object.assign({}, d, { maxHeartRate: d.maxHeartRate! + 6 }),
    )
    expect(bpmOf(library)).toBeCloseTo(195.1, 9)
  })

  it('follows a maximum that rises, by taking the window and not all of time', () => {
    // A young athlete: peaks of 176 in the first year, 183 in the second and 190 in the third, over four years.
    const library = [
      ...season(365, [175.2, 176.4, 176.9, 175.8], 0),
      ...season(365, [182.6, 183.3, 183.9, 182.4], 400),
      ...season(365, [189.2, 190.4, 190.8, 189.6], 800),
      ...season(365, [190.6, 191.1, 190.9, 190.2], 1200),
    ]
    expect(bpmOf(library)).toBeGreaterThan(190)
  })

  it('drops a maximum from before the window when it falls with age', () => {
    const earlier = season(200, [199.2, 199.8, 200.4, 198.9], 0)
    const later = season(400, [192.1, 192.8, 193.4, 191.6], 1500)
    const library = [...earlier, ...later]
    expect(bpmOf(library)).toBeLessThan(194)
  })

  it('counts several activities on one day as one day', () => {
    const library = [...season(200, HARD), digest(90, 199.5, 'run', 1), digest(90, 199.4, 'run', 2)]
    // Both are on day 90: one day at 199.5 cannot make three.
    expect(bpmOf(library)).toBeCloseTo(189.1, 9)
  })

  it('uses all of time when the window holds too few days', () => {
    const early = season(100, [190.2, 189.4, 188.8, 190.7], 0)
    // Ten days three years and more later: fewer than the window needs, so the earlier ones count.
    const recent = Array.from({ length: 10 }, (_, i) => digest(2000 + i * 3, 160 + i))
    const library = [...early, ...recent]
    expect(MIN_WINDOW_DAYS).toBeGreaterThan(10)
    const max = referenceMaxOf(library, end(library))!
    expect(max.bpm).toBeGreaterThan(188)
    expect(max.sinceMs).toBe(START)
  })

  it('asks only for the second highest day of a thin library, and for the one day it has', () => {
    expect(referenceMaxOf([digest(0, 188.6)], START + 1)).toMatchObject({ bpm: 188.6, days: 1 })
    const two = [digest(0, 188.6), digest(3, 184.2)]
    expect(referenceMaxOf(two, end(two))).toMatchObject({ bpm: 184.2, days: 2 })
    // One spike among thirteen days does not set the maximum of a thin library.
    const thin = [...season(12, [186.1]), digest(7, 231.5)]
    expect(thin.length).toBeLessThan(THIN_LIBRARY_DAYS)
    expect(bpmOf(thin)).toBeLessThan(190)
  })

  it('reads a ride-only library on its own, and has nothing without a heart rate', () => {
    const rides = season(200, HARD).map((d) => Object.assign({}, d, { sport: 'ride' as const }))
    expect(referenceMaxOf(rides, end(rides))).not.toBeNull()
    expect(referenceMaxOf([digest(0, null), digest(1, null)], START + DAY_MS)).toBeNull()
    expect(referenceMaxOf([], START)).toBeNull()
  })

  it('says where it counts from: the window start, or the first day of a shorter library', () => {
    const long = season(1400, HARD)
    const at = end(long)
    expect(referenceMaxOf(long, at)!.sinceMs).toBe(at - REFERENCE_WINDOW_DAYS * DAY_MS)
    const short = season(200, HARD)
    expect(referenceMaxOf(short, end(short))!.sinceMs).toBe(START)
  })
})

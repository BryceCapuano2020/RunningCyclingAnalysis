import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { cadenceLockStretches, CADENCE_LOCK } from './cadenceLock'
import type { SeriesSpec } from './test/cadenceLockSeries'
import { honestSeries, plantLock, RIDE_SERIES, RUN_SERIES } from './test/cadenceLockSeries'

/**
 * The cadence-lock detector against seeded athletes (D12 section 2.2). Cadence is generated as the files
 * hold it: a run's in doubled strides (even steps a minute only), a ride's in whole rpm; heart rate in whole
 * bpm. Honest heart rate is an AR(1) around its centre, so smooth and lagging; a lock repeats the cadence.
 */

const ALL = (n: number) => new Uint8Array(n).fill(1)
const between = (r: () => number, low: number, high: number) => low + (high - low) * r()

type Kind = 'run' | 'ride'
const KINDS: Kind[] = ['run', 'ride']
const RANGE: Record<Kind, { hr: [number, number]; cadence: [number, number] }> = {
  run: { hr: [150, 185], cadence: [160, 190] },
  ride: { hr: [100, 175], cadence: [70, 100] },
}
const SHAPE = { run: RUN_SERIES, ride: RIDE_SERIES }

/** One honest athlete's spec; `near` puts the heart rate's centre within 2 of the cadence's: the hard case. */
function athlete(kind: Kind, seed: number, near: boolean, n: number): SeriesSpec {
  const r = mulberry32(seed * 7919 + 3)
  const cadence = between(r, ...RANGE[kind].cadence)
  const hr = near ? cadence + between(r, -2, 2) : between(r, ...RANGE[kind].hr)
  return { n, hr, cadence, ...SHAPE[kind] }
}

const flagged = (s: ReturnType<typeof honestSeries>) =>
  cadenceLockStretches(s.heartRate, s.cadence, ALL(s.heartRate.length)).length > 0

describe('honest athletes', () => {
  for (const kind of KINDS) {
    it(`are flagged on at most 0.1% of 5,000 ${kind}s, a fifth of them with a heart rate near the cadence`, () => {
      let hits = 0
      for (let seed = 0; seed < 5000; seed++) {
        const near = seed % 5 === 0
        hits += flagged(honestSeries(athlete(kind, seed, near, near ? 1800 : 900), seed)) ? 1 : 0
      }
      expect(hits).toBeLessThanOrEqual(5)
    })
  }
})

/** The seed-th planted lock of `lengthS` from second 300 of a 900 s activity whose heart rate is far from the cadence. */
function planted(kind: Kind, seed: number, lengthS: number, noise: number) {
  const spec = athlete(kind, seed, false, 900)
  // A heart rate far from the cadence, so the stretch is the lock alone.
  const series = honestSeries({ ...spec, hr: spec.cadence - 25 }, seed)
  plantLock(series, 300, lengthS, seed + 1, noise)
  return series
}

describe('planted locks', () => {
  const RATES: [number, number][] = [
    [30, 0.8],
    [45, 0.95],
    [90, 0.95],
    [300, 0.95],
  ]
  for (const kind of KINDS) {
    for (const [lengthS, rate] of RATES) {
      it(`of ${lengthS} s on a ${kind} are found at least ${rate * 100}% of the time, no more than 10 s beyond`, () => {
        let found = 0
        const runs = 1000
        for (let seed = 0; seed < runs; seed++) {
          const s = planted(kind, seed, lengthS, 0)
          const stretches = cadenceLockStretches(s.heartRate, s.cadence, ALL(900))
          if (stretches.length === 0) continue
          found++
          const reach = CADENCE_LOCK.marginS
          expect(stretches[0]!.start).toBeGreaterThanOrEqual(300 - (10 - reach))
          expect(stretches[stretches.length - 1]!.end).toBeLessThanOrEqual(
            300 + lengthS + (10 - reach),
          )
        }
        expect(found / runs).toBeGreaterThanOrEqual(rate)
      })
    }
  }

  it('are still found at least 90% of the time over 90 s when the strap is a beat off now and then', () => {
    let found = 0
    for (let seed = 0; seed < 1000; seed++) {
      const s = planted('run', seed, 90, 1)
      found += cadenceLockStretches(s.heartRate, s.cadence, ALL(900)).length > 0 ? 1 : 0
    }
    expect(found / 1000).toBeGreaterThanOrEqual(0.9)
  })
})

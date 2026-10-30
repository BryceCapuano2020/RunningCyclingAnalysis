import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { mergeCurves, monotoneEnvelope } from '../curves'
import type { EffortPoint } from '../effort'
import { mulberry32 } from '../math'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../types'
import { bestOfEach } from './bestCurve'

/** A digest with only what a best reads: its id, sport and curve. */
function digestOf(id: string, sport: Sport, curve: DigestCurvePoint[]): ActivityDigest {
  return { id, sport, curve } as unknown as ActivityDigest
}

/**
 * A library of digests with values drawn from a few levels, so that ties are common, some NaN, and windows that are
 * the point's own length or a longer one carried down, as the digest's envelope leaves them.
 */
function library(count: number, seed: number): ActivityDigest[] {
  const random = mulberry32(seed)
  const levels = [10, 10 + 1e-12, 11, 12, 12 * (1 + 1e-10)]
  return Array.from({ length: count }, (_, k) =>
    digestOf(
      `a${k}`,
      random() < 0.5 ? 'run' : 'ride',
      DURATIONS_S.map((durationS, i) => ({
        durationS,
        value:
          random() < 0.15 ? Number.NaN : levels[Math.floor(random() * levels.length)]! - i * 0.01,
        startIndex: Math.floor(random() * 1000),
        windowS: random() < 0.3 ? durationS * 2 : durationS,
        heartRate: random() < 0.5 ? 150 + Math.floor(random() * 30) : null,
        terms: null,
      })),
    ),
  )
}

/** The definition: each digest's whole curve of candidates, merged pointwise, then the envelope, then the standing points. */
function byMergingCurves(
  ordered: ActivityDigest[],
  sport: Sport,
  valueFor: (digest: ActivityDigest) => (point: DigestCurvePoint) => number,
  aloneFor?: (digest: ActivityDigest) => (point: DigestCurvePoint) => boolean,
): EffortPoint[] {
  const digests = ordered.filter((d) => d.sport === sport)
  const candidates = (digest: ActivityDigest): EffortPoint[] =>
    digest.curve.map((p) => {
      const value = valueFor(digest)(p)
      const found = !Number.isNaN(value)
      return {
        durationS: p.durationS,
        value,
        activityId: found ? digest.id : null,
        startIndex: found ? p.startIndex : -1,
        windowS: found ? p.windowS : null,
        heartRate: found ? p.heartRate : null,
      }
    })
  const unfound = (point: EffortPoint): EffortPoint => ({
    durationS: point.durationS,
    value: Number.NaN,
    activityId: null,
    startIndex: -1,
    windowS: null,
    heartRate: null,
  })
  const empty = () => DURATIONS_S.map((d) => unfound({ durationS: d } as EffortPoint))
  const best = (curves: EffortPoint[][]) =>
    curves.length > 0 ? monotoneEnvelope(mergeCurves(curves)) : empty()
  if (aloneFor === undefined) return best(digests.map(candidates))
  const standing: EffortPoint[][] = []
  const backed = digests.map((digest) => {
    const points = candidates(digest)
    const flags = digest.curve.map(aloneFor(digest))
    if (!flags.includes(true)) return points
    standing.push(points.map((p, i) => (flags[i] ? p : unfound(p))))
    return points.map((p, i) => (flags[i] ? unfound(p) : p))
  })
  const curve = best(backed)
  if (standing.length === 0) return curve
  let shorter = Number.POSITIVE_INFINITY
  return curve.map((point, i) => {
    let placed = point
    for (const points of standing) {
      const alone = points[i]!
      if (alone.value <= shorter && !(alone.value <= placed.value)) placed = alone
    }
    if (!Number.isNaN(placed.value)) shorter = placed.value
    return placed
  })
}

describe('bestOfEach', () => {
  const read = () => (point: DigestCurvePoint) => point.value

  it('is the curve the merge of every digest candidates makes, over many libraries with ties and gaps', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const digests = library(1 + (seed % 25), seed)
      for (const sport of ['run', 'ride'] as const) {
        expect(bestOfEach(digests, sport, read)).toEqual(byMergingCurves(digests, sport, read))
      }
    }
  })

  it('places the points that stand alone as the merge does', () => {
    const alone = (digest: ActivityDigest) => (point: DigestCurvePoint) =>
      (digest.id.length + point.startIndex) % 7 === 0
    for (let seed = 1; seed <= 40; seed++) {
      const digests = library(1 + (seed % 25), 100 + seed)
      expect(bestOfEach(digests, 'ride', read, undefined, alone)).toEqual(
        byMergingCurves(digests, 'ride', read, alone),
      )
    }
  })

  it('keeps only the digests `keep` allows', () => {
    const digests = library(30, 7)
    const odd = (digest: ActivityDigest) => Number(digest.id.slice(1)) % 2 === 1
    expect(bestOfEach(digests, 'run', read, odd)).toEqual(
      byMergingCurves(digests.filter(odd), 'run', read),
    )
  })

  it('has no value at any duration for a sport with no digests', () => {
    const none = bestOfEach([], 'run', read)
    expect(none.map((p) => p.durationS)).toEqual([...DURATIONS_S])
    expect(none.every((p) => Number.isNaN(p.value) && p.activityId === null)).toBe(true)
  })

  it('refuses digests whose curves have different durations', () => {
    const first = digestOf('a', 'run', library(1, 11)[0]!.curve)
    const shorter = digestOf('b', 'run', first.curve.slice(1))
    expect(() => bestOfEach([first, shorter], 'run', read)).toThrow(/same durations/)
  })
})

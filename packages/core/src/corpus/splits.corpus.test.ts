import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { parseFit } from '../fit/parse'
import type { Activity } from '../types'
import { corpusReader } from './helpers'

/*
 * A real run from python-fitparse's test files (dtcooper/python-fitparse, MIT). The splits must
 * account for the same time the device recorded over the same distance. This run stands still through
 * its gaps (a few metres of walking across each), so they are rests: a split leaves out their seconds,
 * and the metres they gained, from the pace it is read at.
 */

const CORPUS = new URL('../../test-corpus/fitparse/', import.meta.url)
const { bytes } = corpusReader(CORPUS)
const RUN = '2013-02-06-12-11-14.fit'

/** Seconds at which the distance first reaches `metres`, found by scanning the 1 Hz samples. */
function elapsedAt(distance: Float64Array, metres: number): number {
  for (let i = 1; i < distance.length; i++) {
    const reached = distance[i]!
    if (reached >= metres) {
      const before = distance[i - 1]!
      return i - 1 + (metres - before) / (reached - before)
    }
  }
  return distance.length - 1
}

/** What the gaps the device did not record hold within [from, to): their seconds, number and rise. */
function gapsIn(activity: Activity, from: number, to: number) {
  let seconds = 0
  let count = 0
  let riseM = 0
  let i = 0
  while (i < activity.n) {
    if (activity.unrecorded?.[i] !== 1) {
      i++
      continue
    }
    let end = i
    while (end < activity.n && activity.unrecorded?.[end] === 1) end++
    const lo = Math.max(i, from)
    const hi = Math.min(end, to)
    if (hi > lo) {
      seconds += hi - lo
      count++
      riseM += activity.distance[Math.min(end, activity.n - 1)]! - activity.distance[i]!
    }
    i = end
  }
  return { seconds, count, riseM }
}

/**
 * The least and most seconds a split of `distanceM` over [from, to) can take. The least is the elapsed
 * time less the gaps. The most adds a second of running for each gap, which a resumed file holds in the
 * step into its first timed sample, and reads the distance less the whole rise across the gaps, which
 * is more than they gained.
 */
function secondsBetween(activity: Activity, from: number, to: number, distanceM: number) {
  const gaps = gapsIn(activity, from, to)
  const timed = to - from - gaps.seconds
  return { least: timed, most: ((timed + gaps.count) * distanceM) / (distanceM - gaps.riseM) }
}

describe('splits on a real run', () => {
  const parsed = parseFit(bytes(RUN), RUN)
  if (!parsed.ok) throw new Error(parsed.reason)
  const [activity] = parsed.activities
  if (!activity) throw new Error('expected one activity')
  const digest = digestActivity(activity)
  const splits = digest.splits
  if (!splits) throw new Error('expected splits on a run')

  it('is a run with altitude, so every split with a known time has a grade-adjusted time', () => {
    expect(activity.sport).toBe('run')
    expect(activity.hasAltitude).toBe(true)
    for (const split of [...splits.km, ...splits.mile]) {
      if (split.seconds !== null) expect(split.gradeAdjustedSeconds).not.toBeNull()
    }
  })

  it.each(['km', 'mile'] as const)(
    'puts every known %s split where an independent scan of the distance puts it, between the time less its gaps and the most its gaps allow',
    (unit) => {
      let before = 0
      for (const split of splits[unit]) {
        const after = before + split.distanceM
        if (split.seconds !== null) {
          const from = elapsedAt(activity.distance, before)
          const to = elapsedAt(activity.distance, after)
          const { least, most } = secondsBetween(activity, from, to, split.distanceM)
          expect(split.seconds).toBeGreaterThanOrEqual(least - 0.5)
          expect(split.seconds).toBeLessThanOrEqual(most + 0.5)
        }
        before = after
      }
    },
  )

  it.each(['km', 'mile'] as const)(
    'sums the %s split seconds to the time the distance they cover took, between the time less its gaps and the most its gaps allow',
    (unit) => {
      const covered = splits[unit].reduce((sum, split) => sum + split.distanceM, 0)
      // An unknown split makes the sum NaN, which fails the check rather than passing it.
      const seconds = splits[unit].reduce((sum, split) => sum + (split.seconds ?? Number.NaN), 0)
      const end = elapsedAt(activity.distance, covered)
      const { least, most } = secondsBetween(activity, 0, end, covered)
      expect(seconds).toBeGreaterThanOrEqual(least - 1)
      expect(seconds).toBeLessThanOrEqual(most + 1)
    },
  )

  it.each(['km', 'mile'] as const)(
    'leaves a %s split unknown exactly when a boundary falls in an unrecorded gap, or it implies too fast a speed',
    (unit) => {
      let before = 0
      for (const split of splits[unit]) {
        const after = before + split.distanceM
        const from = elapsedAt(activity.distance, before)
        const to = elapsedAt(activity.distance, after)
        const inGap = (t: number) => {
          if (t <= 0) return false
          const upper = Math.min(activity.n - 1, Math.ceil(t))
          const lower = Math.max(0, upper - 1)
          return activity.unrecorded?.[upper] === 1 || activity.unrecorded?.[lower] === 1
        }
        const tooFast =
          split.distanceM / secondsBetween(activity, from, to, split.distanceM).least > 12.5
        expect(split.seconds === null).toBe(inGap(from) || inGap(to) || tooFast)
        before = after
      }
    },
  )

  it('pins the kilometre splits of this run to their seconds, so a change in how rests are read shows', () => {
    expect(splits.km.map((split) => split.seconds)).toEqual([
      561.68, 606.26, 601.64, 334.45, 375.15,
    ])
  })

  it('keeps most of the kilometre splits of this run, so a gap voids only the splits it touches', () => {
    const known = splits.km.filter((split) => split.seconds !== null).length
    expect(known).toBeGreaterThanOrEqual(4)
  })

  it('covers the run in whole kilometres, with a partial remainder of at least 100 m last', () => {
    const total = activity.distance[activity.n - 1]!
    const covered = splits.km.reduce((sum, split) => sum + split.distanceM, 0)
    const uncovered = total - covered
    expect(uncovered).toBeGreaterThanOrEqual(-1e-6)
    expect(uncovered).toBeLessThan(100)
    const wholeKm = Math.floor(total / 1000)
    expect(splits.km.slice(0, wholeKm).every((split) => split.distanceM === 1000)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { parseFit } from '../fit/parse'
import { corpusReader } from './helpers'

/*
 * A real run from python-fitparse's test files (dtcooper/python-fitparse, MIT). The splits must
 * account for the same time the device recorded over the same distance.
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
    'puts every known %s split where an independent scan of the distance puts it, within 0.5 s',
    (unit) => {
      let before = 0
      for (const split of splits[unit]) {
        const after = before + split.distanceM
        if (split.seconds !== null) {
          const expected =
            elapsedAt(activity.distance, after) - elapsedAt(activity.distance, before)
          expect(Math.abs(split.seconds - expected)).toBeLessThan(0.5)
        }
        before = after
      }
    },
  )

  it.each(['km', 'mile'] as const)(
    'sums the %s split seconds to the time the distance they cover took, within 1 s',
    (unit) => {
      const covered = splits[unit].reduce((sum, split) => sum + split.distanceM, 0)
      // An unknown split makes the sum NaN, which fails the check rather than passing it.
      const seconds = splits[unit].reduce((sum, split) => sum + (split.seconds ?? Number.NaN), 0)
      expect(Math.abs(seconds - elapsedAt(activity.distance, covered))).toBeLessThan(1)
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
        const tooFast = split.distanceM / (to - from) > 12.5
        expect(split.seconds === null).toBe(inGap(from) || inGap(to) || tooFast)
        before = after
      }
    },
  )

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

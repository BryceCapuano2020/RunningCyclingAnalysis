import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST } from '../constants'
import { runReadings } from '../fitness/runReadings'
import { descentCost, runCost } from '../metabolic'
import type { Activity, ActivityDigest, DigestSplit } from '../types'
import { digestActivityAt } from './digestActivity'
import { hillRun, ratioRun } from './test/gateFixturesE5'
import { syntheticActivity } from './test/syntheticActivity'

const at = (a: Activity, revision: number) => digestActivityAt(a, revision)

/** The digest without the revision that wrote it. */
const body = (d: ActivityDigest) => ({ ...d, modelRevision: 0 })

/** Flat-equivalent seconds over clock seconds for each kilometre that has both. */
const credits = (d: ActivityDigest): number[] =>
  d.splits!.km.flatMap((s: DigestSplit) =>
    s.seconds === null || s.gradeAdjustedSeconds === null
      ? []
      : [s.gradeAdjustedSeconds / s.seconds],
  )

describe('a steep descent at revision 7', () => {
  // hillRun climbs for the first third, so the later kilometres are the steady descent.
  const steady = (d: ActivityDigest) => d.splits!.km[4]!

  it('D1: a steady -10% descent keeps the credited share of the saving, not all of it', () => {
    const run = hillRun(-0.1)
    const [before, after] = [steady(at(run, 6)), steady(at(run, 7))]
    expect(before.gradeAdjustedSeconds! / before.seconds!).toBeCloseTo(
      FLAT_RUN_COST / runCost(-0.1),
      3,
    )
    expect(after.gradeAdjustedSeconds! / after.seconds!).toBeCloseTo(
      FLAT_RUN_COST / descentCost(-0.1),
      3,
    )
    expect(after.gradeAdjustedSeconds!).toBeLessThan(before.gradeAdjustedSeconds!)
    expect(after.gradeAdjustedSeconds!).toBeGreaterThan(after.seconds!)
  })

  it('D7: the credit follows descentCost across -5% to -25%, and stops growing past -18%', () => {
    const shares = [-0.05, -0.08, -0.12, -0.18, -0.25].map((g) => {
      const split = steady(at(hillRun(g), 7))
      expect(split.gradeAdjustedSeconds! / split.seconds!, `${g}`).toBeCloseTo(
        FLAT_RUN_COST / descentCost(g),
        3,
      )
      return split.gradeAdjustedSeconds! / split.seconds!
    })
    expect(shares[3]).toBeCloseTo(shares[4]!, 3)
    for (let i = 1; i < 4; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]!)
  })

  it('D3: a run with no grade below -4% is the same digest at revisions 6 and 7', () => {
    const run = hillRun(-0.03)
    expect(body(at(run, 7))).toEqual(body(at(run, 6)))
  })

  it('D6: a symmetric up and down loop nets nearer to zero credit than before', () => {
    const n = 2400
    const altitude = new Float64Array(n)
    for (let i = 1; i < n; i++) altitude[i] = altitude[i - 1]! + (i < n / 2 ? 0.06 : -0.06) * 3
    const loop = syntheticActivity({ id: 'loop', n, speed: new Float64Array(n).fill(3), altitude })
    const net = (d: ActivityDigest) => {
      const whole = d.splits!.km.filter(
        (s) => s.seconds !== null && s.gradeAdjustedSeconds !== null,
      )
      return (
        whole.reduce((sum, s) => sum + s.gradeAdjustedSeconds!, 0) /
        whole.reduce((sum, s) => sum + s.seconds!, 0)
      )
    }
    expect(Math.abs(net(at(loop, 7)) - 1)).toBeLessThan(0.02)
    expect(Math.abs(net(at(loop, 7)) - 1)).toBeLessThan(Math.abs(net(at(loop, 6)) - 1))
  })

  it('moves only the splits, not the bests or the curve, of a run with no steep descent', () => {
    for (const run of [hillRun(-0.03), ratioRun(1.011)]) {
      const [before, after] = [at(run, 6), at(run, 7)]
      expect(after.curve).toEqual(before.curve)
      expect(after.hrBlocks).toEqual(before.hrBlocks)
      expect(after.distanceBests).toEqual(before.distanceBests)
    }
  })
})

describe('the distance against the speed stream at revision 7', () => {
  const worst = (d: ActivityDigest) => Math.max(...credits(d).map((c) => Math.abs(c - 1)))

  it('D4: a flat run whose distance is 1.1% over its speed shows no credit in any split', () => {
    const run = ratioRun(1.011)
    expect(worst(at(run, 6))).toBeGreaterThan(0.01)
    expect(worst(at(run, 7))).toBeLessThan(0.001)
  })

  it('D4: it corrects the whole range from 0.97 to 1.07', () => {
    for (const ratio of [0.97, 1.0, 1.03, 1.07]) {
      expect(worst(at(ratioRun(ratio), 7)), `${ratio}`).toBeLessThan(0.001)
    }
  })

  it('D5: a ratio outside 0.95 to 1.08 is left as it was', () => {
    for (const ratio of [0.9, 0.94, 1.1, 1.2]) {
      const run = ratioRun(ratio)
      expect(at(run, 7).splits, `${ratio}`).toEqual(at(run, 6).splits)
    }
  })

  it('leaves the curve, bests and the metabolic stream alone: only the splits move', () => {
    const run = ratioRun(1.011)
    expect({ ...at(run, 7), splits: undefined }).toEqual({
      ...at(run, 6),
      splits: undefined,
      modelRevision: 7,
    })
  })

  it('D9: a treadmill run is corrected inside the bounds, as it was outside them, and is not a fitness run', () => {
    const treadmill = (ratio: number) => {
      const run = ratioRun(ratio)
      run.indoor = true
      return run
    }
    expect(worst(at(treadmill(1.01), 7))).toBeLessThan(0.001)
    expect(worst(at(treadmill(0.92), 7))).toBeGreaterThan(0.05)
    expect(at(treadmill(1.1), 7).splits).toEqual(at(treadmill(1.1), 6).splits)
    for (const revision of [6, 7]) {
      expect(runReadings(at(treadmill(1.01), revision), 'run')).toBeNull()
    }
  })
})

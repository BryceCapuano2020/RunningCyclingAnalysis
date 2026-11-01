import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST } from '../constants'
import { runReadings } from '../fitness/runReadings'
import { descentCost, runCost } from '../metabolic'
import type { Activity, ActivityDigest, DigestSplit } from '../types'
import { digestActivity } from './digestActivity'
import { gapRun, hillRun, ratioRun } from './test/gateFixturesE5'
import { syntheticActivity } from './test/syntheticActivity'

const at = (a: Activity) => digestActivity(a)

/** Flat-equivalent seconds over clock seconds for each kilometre that has both. */
const credits = (d: ActivityDigest): number[] =>
  d.splits!.km.flatMap((s: DigestSplit) =>
    s.seconds === null || s.gradeAdjustedSeconds === null
      ? []
      : [s.gradeAdjustedSeconds / s.seconds],
  )

describe('a steep descent', () => {
  // hillRun climbs for the first third, so the later kilometres are the steady descent.
  const steady = (d: ActivityDigest) => d.splits!.km[4]!

  it('D1: a steady -10% descent keeps the credited share of the saving, not all of it', () => {
    const run = hillRun(-0.1)
    const split = steady(at(run))
    expect(split.gradeAdjustedSeconds! / split.seconds!).toBeCloseTo(
      FLAT_RUN_COST / descentCost(-0.1),
      3,
    )
    // Less than all of Minetti's saving (what revision 6 credited), and still some of it.
    expect(split.gradeAdjustedSeconds! / split.seconds!).toBeLessThan(FLAT_RUN_COST / runCost(-0.1))
    expect(split.gradeAdjustedSeconds!).toBeGreaterThan(split.seconds!)
  })

  it('D7: the credit follows descentCost across -5% to -25%, and stops growing past -18%', () => {
    const shares = [-0.05, -0.08, -0.12, -0.18, -0.25].map((g) => {
      const split = steady(at(hillRun(g)))
      expect(split.gradeAdjustedSeconds! / split.seconds!, `${g}`).toBeCloseTo(
        FLAT_RUN_COST / descentCost(g),
        3,
      )
      return split.gradeAdjustedSeconds! / split.seconds!
    })
    expect(shares[3]).toBeCloseTo(shares[4]!, 3)
    for (let i = 1; i < 4; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]!)
  })

  it('D3: a run with no grade below -4% is credited Minetti’s whole saving, as revision 6 did', () => {
    const split = steady(at(hillRun(-0.03)))
    expect(split.gradeAdjustedSeconds! / split.seconds!).toBeCloseTo(
      FLAT_RUN_COST / runCost(-0.03),
      3,
    )
  })

  it('D6: a symmetric up and down loop nets to nearly zero credit', () => {
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
    expect(Math.abs(net(at(loop)) - 1)).toBeLessThan(0.02)
  })
})

describe('the distance against the speed stream', () => {
  const worst = (d: ActivityDigest) => Math.max(...credits(d).map((c) => Math.abs(c - 1)))

  it('D4: a flat run whose distance is 1.1% over its speed shows no credit in any split', () => {
    const run = ratioRun(1.011)
    expect(worst(at(run))).toBeLessThan(0.001)
  })

  it('D4: it corrects the whole range from 0.97 to 1.07', () => {
    for (const ratio of [0.97, 1.0, 1.03, 1.07]) {
      expect(worst(at(ratioRun(ratio))), `${ratio}`).toBeLessThan(0.001)
    }
  })

  it('D4: a recording gap of 6, 10 or 20 s does not push the ratio above 1', () => {
    for (const gapS of [6, 10, 20]) {
      const run = gapRun(gapS)
      // Without the gap's seconds out of the ratio a 20 s gap reads 6% over.
      expect(worst(at(run)), `${gapS}`).toBeLessThan(0.001)
    }
  })

  it('D5: a ratio outside 0.95 to 1.08 is left as it was: the credit shows the whole difference', () => {
    for (const ratio of [0.9, 0.94, 1.1, 1.2]) {
      expect(worst(at(ratioRun(ratio))), `${ratio}`).toBeGreaterThan(Math.abs(ratio - 1) * 0.5)
    }
  })

  it('D9: a treadmill run is corrected inside the bounds, as it was outside them, and is not a fitness run', () => {
    const treadmill = (ratio: number) => {
      const run = ratioRun(ratio)
      run.indoor = true
      return run
    }
    expect(worst(at(treadmill(1.01)))).toBeLessThan(0.001)
    expect(worst(at(treadmill(0.92)))).toBeGreaterThan(0.05)
    expect(worst(at(treadmill(1.1)))).toBeGreaterThan(0.05)
    expect(runReadings(at(treadmill(1.01)), 'run')).toBeNull()
  })
})

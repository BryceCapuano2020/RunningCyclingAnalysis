import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { digestActivity } from '../digest/digestActivity'
import { runCentralWkg } from '../digest/rideCurves'
import { judgeHeartRate } from '../digest/setAside'
import { persona } from '../synthetic/noise/personas'
import type { PersonaName } from '../synthetic/noise/personas'
import { quantile } from '../math'
import type { ActivityDigest } from '../types'
import { vo2maxFromHeartRate } from './vo2max'
import { VO2MAX_SHARE_ZERO } from './vo2maxShare'

/**
 * The heart-rate VO2max under the old gate (a window counts in full from 85% of the reference heart rate, not at all
 * under) and the ramp (from 85% up to a full 90%), read week by week on generated libraries of the `measured` device
 * level: the same trailing 12 weeks the default period holds, moved a week at a time. What matters is how far the estimate
 * jumps from one week to the next, how far the ramp sits from the old gate, and how many weeks gain or lose an estimate.
 *
 * Measured (4 personas x 6 seeds x 52 weeks, 984 weekly reads; jumps are |ln change| between consecutive weeks, all in %):
 * - old gate: median 0, p90 2.7, max 22.6 (738 jumps);
 * - ramp:     median 0, p90 2.5, max 25.6 (738 jumps);
 * - ramp against the old gate, same week: median 0.4, p90 1.9, max 9.9 (780 weeks);
 * - weeks that gain or lose an estimate: 0 and 0 (the ramp keeps the old rule: two runs at or over the line).
 * The largest jump, in the old gate and the ramp alike, is one treadmill-heavy library (seed 4): few outdoor runs, so an
 * estimate rests on two or three and one leaving the window moves it. The next largest ramp jump is 13.9.
 */

const OLD_GATE = (share: number) => (share >= VO2MAX_SHARE_ZERO ? 1 : 0)
const PERSONAS: PersonaName[] = ['watchRunner', 'phoneSlowRunner', 'treadmillHeavy', 'twoSport']
const SEEDS = 6
const WEEKS = 52
const WINDOW_WEEKS = 12
const WEEK_MS = 7 * DAY_MS
const SETTINGS = { massKg: 75, bikeMassKg: 9 }

interface Series {
  old: (number | null)[]
  ramp: (number | null)[]
}

function weeklySeries(digests: ActivityDigest[]): Series {
  const reference = judgeHeartRate(digests, SETTINGS).referenceHr.run
  const end = Math.max(...digests.map((d) => d.startMs))
  const old: (number | null)[] = []
  const ramp: (number | null)[] = []
  for (let at = end - (WEEKS - WINDOW_WEEKS) * WEEK_MS; at <= end; at += WEEK_MS) {
    const window = digests.filter((d) => d.startMs <= at && d.startMs > at - WINDOW_WEEKS * WEEK_MS)
    const read = (weightOf?: (share: number) => number) =>
      vo2maxFromHeartRate(window, reference, runCentralWkg, undefined, weightOf)?.vo2max ?? null
    old.push(read(OLD_GATE))
    ramp.push(read())
  }
  return { old, ramp }
}

/** |ln change| between consecutive weeks that both have an estimate. */
function jumps(series: (number | null)[]): number[] {
  const out: number[] = []
  for (let i = 1; i < series.length; i++) {
    const [a, b] = [series[i - 1], series[i]]
    if (a != null && b != null) out.push(Math.abs(Math.log(b / a)))
  }
  return out
}

const stats = (xs: number[]) => ({
  median: quantile(xs, 0.5),
  p90: quantile(xs, 0.9),
  max: Math.max(...xs),
  n: xs.length,
})

describe('the heart-rate VO2max gate on generated libraries', () => {
  it('jumps no more from week to week with the ramp than with the old gate, and stays near it', () => {
    const oldJumps: number[] = []
    const rampJumps: number[] = []
    const apart: number[] = []
    let gained = 0
    let lost = 0
    let weeks = 0
    const worst: { name: string; seed: number; jump: number }[] = []
    for (const name of PERSONAS) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const digests = persona(name, seed, WEEKS).entries.map((e) => digestActivity(e.activity))
        const { old, ramp } = weeklySeries(digests)
        oldJumps.push(...jumps(old))
        const own = jumps(ramp)
        rampJumps.push(...own)
        worst.push({ name, seed, jump: own.length === 0 ? 0 : Math.max(...own) })
        old.forEach((o, i) => {
          weeks++
          const r = ramp[i]!
          if (o == null && r != null) gained++
          if (o != null && r == null) lost++
          if (o != null && r != null) apart.push(Math.abs(Math.log(r / o)))
        })
      }
    }
    const report = {
      old: stats(oldJumps),
      ramp: stats(rampJumps),
      apart: stats(apart),
      gained,
      lost,
      weeks,
      worst: worst.sort((a, b) => b.jump - a.jump).slice(0, 5),
    }
    expect(report.ramp.p90).toBeLessThanOrEqual(report.old.p90)
    // The one library with a large jump has it under either gate; the ramp may add a little, not a lot.
    expect(report.ramp.max).toBeLessThanOrEqual(report.old.max * 1.25)
    expect(report.gained).toBe(0)
    expect(report.lost).toBe(0)
  }, 600_000)
})

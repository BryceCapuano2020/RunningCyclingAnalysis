import { describe, expect, it, vi } from 'vitest'
import { DURATIONS_S } from '../constants'
import { mulberry32, normal } from '../math'
import { durationProfile } from './index'
import type { ProfilePoint } from './index'

vi.setConfig({ testTimeout: 600_000 })

/** Morton's model for a 250 W rider: CP 250, W' 20 kJ, Pmax 1000. */
const truth = (t: number): number => 250 + 20_000 / (t + 20_000 / (1000 - 250))

const LONGEST_S = 3600
const TRIALS = 400

/**
 * A library of `n` activities and the best it holds at each curve duration up to an hour. An activity reaches a length
 * between a minute and an hour and carries one effort through every duration it reaches, so the bests share their
 * efforts as real ones do (the monotone envelope). Each effort lands `shortfall` under the athlete's curve, carries the
 * meter's error as one number, and is lower at the lengths it did not aim at. Each duration also has a habit: the
 * athlete tries it more or less than the next (3%), which the curve's smoothness does not explain and which is what
 * makes durations stand out with nothing planted. `planted` raises one duration's best by a fraction.
 */
function library(
  n: number,
  seed: number,
  shortfall: number,
  planted?: { durationS: number; size: number },
): ProfilePoint[] {
  const random = mulberry32(seed)
  const durations = DURATIONS_S.filter((d) => d <= LONGEST_S)
  const habit = durations.map(() => 0.03 * normal(random))
  const best = durations.map(() => ({ value: 0, session: '' }))
  for (let a = 0; a < n; a++) {
    const reach = Math.exp(Math.log(60) + random() * (Math.log(LONGEST_S) - Math.log(60)))
    const slope = 0.02 + 0.04 * random()
    const effort = Math.exp(-Math.abs(shortfall * normal(random)))
    const meter = Math.exp(0.03 * normal(random))
    durations.forEach((d, i) => {
      if (d > reach) return
      const value =
        truth(d) *
        effort *
        meter *
        Math.exp(habit[i]! - slope * Math.log(reach / d) + 0.01 * normal(random))
      if (value > best[i]!.value) best[i] = { value, session: `a${a}` }
    })
  }
  for (let i = durations.length - 2; i >= 0; i--) {
    if (best[i]!.value < best[i + 1]!.value) best[i] = best[i + 1]!
  }
  return durations.flatMap((durationS, i) =>
    best[i]!.value > 0
      ? [
          {
            durationS,
            value: best[i]!.value * (planted?.durationS === durationS ? 1 + planted.size : 1),
            sessionId: best[i]!.session,
          },
        ]
      : [],
  )
}

/** The share of profiles that stand out somewhere, and of those the share that name the planted duration. */
function standOutRate(n: number, shortfall: number, planted?: { durationS: number; size: number }) {
  let ready = 0
  let flagged = 0
  let named = 0
  for (let seed = 1; seed <= TRIALS; seed++) {
    const profile = durationProfile(library(n, seed * 31 + n, shortfall, planted), 5, n)
    if (profile.status !== 'ready') continue
    ready++
    if (profile.rows.some((row) => row.standsOut !== null)) flagged++
    if (planted && profile.rows.find((row) => row.durationS === planted.durationS)?.standsOut)
      named++
  }
  return { flagged: flagged / ready, named: named / ready }
}

describe('stand-outs when nothing is planted', () => {
  // Observed over 400 profiles. Before the library-size level and the shrunk spread, at a 10% shortfall, N 15 / 25 / 40 flagged
  // 6.3 / 8.5 / 3.8%, and N 25 at 6%, 3.8%. Now 2.5 / 5.5 / 3.8%, and 3.0%.
  it.each([
    [15, 0.1, 0.05],
    [25, 0.1, 0.075],
    [40, 0.1, 0.06],
    [25, 0.06, 0.05],
  ])(
    'N = %i activities, efforts %f short: under %f of profiles flag a duration',
    (n, shortfall, bound) => {
      expect(standOutRate(n, shortfall).flagged).toBeLessThan(bound)
    },
  )
})

describe('a planted stand-out is still found', () => {
  // Observed: 73% at 40 activities (73% before), 34% at 15 (57% before).
  it('finds a 15% rise at 20 minutes in most profiles of 40 activities', () => {
    const rate = standOutRate(40, 0.06, { durationS: 1200, size: 0.15 })
    expect(rate.named).toBeGreaterThan(0.65)
  })

  it('finds it less often in a small library, which is the price of flagging less there', () => {
    const small = standOutRate(15, 0.06, { durationS: 1200, size: 0.15 })
    const large = standOutRate(40, 0.06, { durationS: 1200, size: 0.15 })
    expect(small.named).toBeLessThan(large.named)
    expect(small.named).toBeLessThan(0.5)
  })
})

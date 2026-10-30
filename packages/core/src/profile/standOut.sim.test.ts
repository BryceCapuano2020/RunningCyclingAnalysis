import { describe, expect, it, vi } from 'vitest'
import { durationProfile } from './index'
import { library } from './test/library'

vi.setConfig({ testTimeout: 600_000 })

const TRIALS = 400

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

describe('the size a stand-out states', () => {
  /** The mean reported size, over the profiles that name the planted duration, as a share of the planted size. */
  function retention(n: number, size: number): number {
    let sum = 0
    let named = 0
    for (let seed = 1; seed <= TRIALS; seed++) {
      const profile = durationProfile(
        library(n, seed * 31 + n, 0.06, { durationS: 1200, size }),
        5,
        n,
      )
      if (profile.status !== 'ready') continue
      const row = profile.rows.find((r) => r.durationS === 1200)
      if (row?.standsOut) {
        sum += row.residual
        named++
      }
    }
    return sum / named / size
  }

  // Observed: the size stated, over the planted size, among the profiles that named it. Before the winner's-curse
  // correction (James-Stein shrink) 1.46 / 1.11 / 1.04 at planted 10 / 15 / 25% (N 40); now 1.13 / 0.93 / 1.05.
  it.each([
    [40, 0.1, 0.8, 1.3],
    [40, 0.15, 0.85, 1.1],
    [40, 0.25, 0.9, 1.15],
    [80, 0.15, 0.85, 1.1],
  ])('at N = %i, a planted %f is stated at %f to %f of its size', (n, size, least, most) => {
    const kept = retention(n, size)
    expect(kept).toBeGreaterThan(least)
    expect(kept).toBeLessThan(most)
  })
})

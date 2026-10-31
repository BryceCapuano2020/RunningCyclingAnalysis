import { describe, expect, it } from 'vitest'
import { mulberry32, normal, quantile } from '../math'
import { FITNESS } from './params'
import { heatOf, heatTerm, withHeat } from './heat'
import type { HeatRun } from './heat'

const H = FITNESS.heat

interface Spec {
  weeks: number
  perWeek?: number
  b?: number
  /** The share of runs that carry the index at a week. */
  coverage?: (week: number) => number
  seed?: number
  /** A shift of every reading from this week on (a new watch). */
  bias?: { week: number; size: number }
}

/** Steady runs with a yearly swing in the sensor's index; a warm day costs `b` log units a ten degrees above the cooler runs. */
function library(spec: Spec): HeatRun[] {
  const { weeks, perWeek = 3, b = 0.02, coverage = () => 1, seed = 1, bias } = spec
  const random = mulberry32(seed)
  const raw: { t: number; week: number; c: number; noise: number }[] = []
  for (let week = 0; week < weeks; week++) {
    for (let i = 0; i < perWeek; i++) {
      const t = week * 7 + i * 2 + 1
      const c = 14 + 9 * Math.sin((2 * Math.PI * (t - 80)) / 365.25) + 2.5 * normal(random)
      raw.push({ t, week, c, noise: 0.03 * normal(random) })
    }
  }
  const cooler = quantile(
    raw.map((r) => r.c),
    0.25,
  )
  return raw.map((r, i) => ({
    id: `r${i}`,
    t: r.t,
    x: r.noise - b * heatOf(r.c, cooler),
    c:
      random() < coverage(r.week)
        ? r.c + (bias !== undefined && r.week >= bias.week ? bias.size : 0)
        : null,
  }))
}

const END = (weeks: number) => weeks * 7

/** The within-block slope of value on heat of a series, as the term reads it. */
function slopeOf(runs: readonly { t: number; x: number; c: number | null }[], cRef: number) {
  const blocks = new Map<number, { h: number; x: number }[]>()
  for (const r of runs) {
    if (r.c === null) continue
    const key = Math.floor(r.t / H.blockDays)
    blocks.set(key, [...(blocks.get(key) ?? []), { h: heatOf(r.c, cRef), x: r.x }])
  }
  let sxy = 0
  let sxx = 0
  for (const block of blocks.values()) {
    if (block.length < H.minBlock) continue
    const mh = block.reduce((s, r) => s + r.h, 0) / block.length
    const mx = block.reduce((s, r) => s + r.x, 0) / block.length
    for (const r of block) {
      sxy += (r.h - mh) * (r.x - mx)
      sxx += (r.h - mh) ** 2
    }
  }
  return sxy / sxx
}

describe('heatOf', () => {
  it('is tens of degrees above the reference, and none below', () => {
    expect(heatOf(25, 15)).toBe(1)
    expect(heatOf(20, 15)).toBe(0.5)
    expect(heatOf(10, 15)).toBe(0)
  })
})

describe('heatTerm', () => {
  it('finds what a warm day costs, a little under the truth (shrunk), and never negative', () => {
    const runs = library({ weeks: 130, b: 0.03 })
    const term = heatTerm(runs, END(130))
    expect(term).not.toBeNull()
    expect(term!.b).toBeGreaterThan(0.02)
    expect(term!.b).toBeLessThanOrEqual(0.03 + 0.005)
    expect(term!.b).toBeLessThanOrEqual(H.bMax)
  })

  it('removes the loss: the adjusted values do not move with the heat within a block', () => {
    const runs = library({ weeks: 130, b: 0.03 })
    const term = heatTerm(runs, END(130))!
    const before = slopeOf(runs, term.cRef)
    const adjusted = withHeat(runs, term).map((r, i) => ({ ...r, c: runs[i]!.c }))
    const after = slopeOf(adjusted, term.cRef)
    expect(before).toBeLessThan(-0.02)
    expect(Math.abs(after)).toBeLessThan(0.35 * Math.abs(before))
  })

  it('adds the loss back and does not take it off: the sign is x + b h', () => {
    const runs = library({ weeks: 130, b: 0.03 })
    const term = heatTerm(runs, END(130))!
    const adjusted = withHeat(runs, term)
    const warm = runs.findIndex((r) => r.c !== null && heatOf(r.c, term.cRef) > 1)
    expect(adjusted[warm]!.x).toBeGreaterThan(runs[warm]!.x)
    expect(adjusted[warm]!.x - runs[warm]!.x).toBeCloseTo(
      term.b * heatOf(runs[warm]!.c!, term.cRef),
      12,
    )
    // A run with no reading, and a run cooler than the reference, are as they were.
    const cool = runs.findIndex((r) => r.c !== null && r.c <= term.cRef)
    expect(adjusted[cool]!.x).toBe(runs[cool]!.x)
    const none = [{ id: 'n', t: 5, x: 0.1, c: null }]
    expect(withHeat(none, term)[0]).toEqual({ id: 'n', t: 5, x: 0.1 })
  })

  it('is no term for an athlete whom a warm day does not slow, or who runs faster in it', () => {
    const none = heatTerm(library({ weeks: 130, b: 0 }), END(130))
    expect(none === null || none.b < 0.005).toBe(true)
    // Warmer runs faster: the slope is positive, so b is clamped to 0, which is no term at all.
    const faster = library({ weeks: 130, b: -0.03 })
    expect(heatTerm(faster, END(130))).toBeNull()
  })

  it('is clamped above', () => {
    const term = heatTerm(library({ weeks: 130, b: 0.2 }), END(130))
    expect(term!.b).toBeLessThanOrEqual(H.bMax)
  })

  describe('coverage', () => {
    const weeks = 130
    it('needs 60% of the steady runs to carry a temperature, and at least 40 of them', () => {
      expect(heatTerm(library({ weeks, coverage: () => 0.55 }), END(weeks))).toBeNull()
      expect(heatTerm(library({ weeks, coverage: () => 0.65 }), END(weeks))).not.toBeNull()
      // 100 weeks of one run a week with 65% coverage: 65 over two years is enough; 30 weeks gives 19.
      expect(heatTerm(library({ weeks: 30, perWeek: 1, coverage: () => 1 }), END(30))).toBeNull()
    })

    it('stays on down to 50% once on, and goes off below it', () => {
      const from = 60
      const drifted = (share: number) =>
        library({ weeks, coverage: (w) => (w < from ? 0.8 : share) })
      expect(heatTerm(drifted(0.55), END(weeks))).not.toBeNull()
      expect(heatTerm(drifted(0.45), END(weeks))).toBeNull()
      // Never on at 55%: the same share is not enough to turn it on.
      expect(heatTerm(library({ weeks, coverage: () => 0.55 }), END(weeks))).toBeNull()
    })

    it('needs the heat to vary: ten degrees from the cooler runs', () => {
      const flat = library({ weeks, b: 0.03 }).map((r) => ({
        ...r,
        c: r.c === null ? null : 15 + (r.c - 15) * 0.1,
      }))
      expect(heatTerm(flat, END(weeks))).toBeNull()
    })

    it('counts only the last two years', () => {
      // Three years of full coverage, then a year with none: the window holds half of each, so it is under 60%.
      const runs = library({ weeks: 208, coverage: (w) => (w < 156 ? 1 : 0) })
      expect(heatTerm(runs, END(208))).toBeNull()
    })
  })

  it('is a watch that reads 3 degrees higher from the second year: the term moves little', () => {
    const plain = heatTerm(library({ weeks: 130, b: 0.03 }), END(130))!
    const shifted = heatTerm(
      library({ weeks: 130, b: 0.03, bias: { week: 80, size: 3 } }),
      END(130),
    )!
    expect(Math.abs(shifted.b - plain.b)).toBeLessThan(0.012)
  })

  it('is a function of the runs alone: their order in the list is the caller’s, the answer is the same twice', () => {
    const runs = library({ weeks: 130, b: 0.03 })
    expect(heatTerm(runs, END(130))).toEqual(heatTerm([...runs], END(130)))
  })

  it('has nothing to do without a single temperature', () => {
    const runs = library({ weeks: 130 }).map((r) => ({ ...r, c: null }))
    expect(heatTerm(runs, END(130))).toBeNull()
    expect(heatTerm([], 100)).toBeNull()
  })
})

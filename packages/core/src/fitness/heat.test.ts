import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { ActivityDigest } from '../types'
import { fitnessStatuses } from './compute'
import { fitHeat, heatIsOn, heatOf, withoutHeat } from './heat'
import { mulberry32, normal } from '../math'
import type { RunPoint } from './windows'

const NONE: ReadonlySet<string> = new Set()

/** `n` runs, one every 2 days, with a seeded index around 14 (swinging 9 over the year) and a loss of `b` per 10 degrees above 12. */
function runs(
  n: number,
  b: number,
  carries: (i: number) => boolean = () => true,
  seed = 3,
): RunPoint[] {
  const random = mulberry32(seed)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 2
    const c =
      Math.round((14 + 9 * Math.sin((2 * Math.PI * t) / 365.25) + 4 * normal(random)) * 2) / 2
    const x = 0.038 * normal(random) - (b * Math.max(0, c - 12)) / 10
    return carries(i) ? { id: `r${i}`, t, x, c } : { id: `r${i}`, t, x }
  })
}
const DAY = 600

describe('heat of a run', () => {
  it('is how far its index stands above the cooler runs, in tens of degrees, and never negative', () => {
    expect(heatOf(25, 15)).toBe(1)
    expect(heatOf(15, 15)).toBe(0)
    expect(heatOf(5, 15)).toBe(0)
  })
})

describe('the warm-day term', () => {
  it('is fitted from a planted loss, shrunk a little, and takes it out: the adjusted series no longer follows the heat', () => {
    const points = runs(300, 0.03)
    const term = fitHeat(points, DAY)!
    expect(term.b).toBeGreaterThan(0.015)
    expect(term.b).toBeLessThanOrEqual(0.03)
    const slope = (rs: readonly RunPoint[]) => {
      const hs = rs.map((r) => heatOf(r.c!, term.cRef))
      const mh = hs.reduce((p, q) => p + q, 0) / hs.length
      const mx = rs.reduce((p, r) => p + r.x, 0) / rs.length
      return (
        rs.reduce((p, r, i) => p + (hs[i]! - mh) * (r.x - mx), 0) /
        hs.reduce((p, h) => p + (h - mh) ** 2, 0)
      )
    }
    expect(slope(points)).toBeLessThan(-0.02)
    expect(Math.abs(slope(withoutHeat(points, term)))).toBeLessThan(0.012)
  })

  it('adds the loss back, so b is never negative: the sign is the one that removes the loss', () => {
    const points = runs(300, 0.03)
    const term = fitHeat(points, DAY)!
    expect(term.b).toBeGreaterThan(0)
    const hot = points.find((p) => p.c! > 24)!
    expect(withoutHeat([hot], term)[0]!.x).toBeGreaterThan(hot.x)
    // Warmer runs that are faster read as no effect, not as a negative one.
    expect(fitHeat(runs(300, -0.03), DAY)).toBeNull()
  })

  it('leaves a run with no temperature as it was', () => {
    const points = runs(300, 0.03, (i) => i % 3 !== 0)
    const term = fitHeat(points, DAY)!
    const adjusted = withoutHeat(points, term)
    points.forEach((p, i) => {
      if (p.c === undefined) expect(adjusted[i]).toBe(p)
    })
  })

  it('is off below 60% coverage, with fewer than 40 runs carrying a temperature, or with no spread of heat', () => {
    expect(
      heatIsOn(
        runs(300, 0.03, (i) => i % 10 < 5),
        DAY,
      ),
    ).toBe(false)
    expect(
      heatIsOn(
        runs(300, 0.03, (i) => i % 10 < 6),
        DAY,
      ),
    ).toBe(true)
    expect(
      heatIsOn(
        runs(60, 0.03, (i) => i < 39),
        DAY,
      ),
    ).toBe(false)
    const flat = runs(300, 0).map((p) => Object.assign({}, p, { c: 14 }))
    expect(heatIsOn(flat, DAY)).toBe(false)
    expect(fitHeat(flat, DAY)).toBeNull()
  })

  it('goes on at 60%, stays on down to 50%, and goes off below it: no flapping', () => {
    // A library whose share of runs with a temperature moves with time: `share(i)` of run i.
    const library = (share: (i: number) => number) =>
      runs(400, 0.03, (i) => (i * 0.618033) % 1 < share(i), 5)
    // 70% for the first 100 runs, then 55%: still on at the end.
    expect(
      heatIsOn(
        library((i) => (i < 100 ? 0.7 : 0.55)),
        DAY + 300,
      ),
    ).toBe(true)
    // Straight to 55% never reaches 60%: off.
    expect(
      heatIsOn(
        library(() => 0.55),
        DAY + 300,
      ),
    ).toBe(false)
    // 70% for the first 100 runs, then 40%: the share falls under 50% and it goes off.
    expect(
      heatIsOn(
        library((i) => (i < 100 ? 0.7 : 0.4)),
        DAY + 300,
      ),
    ).toBe(false)
  })

  it('counts a run without a temperature (a digest of an earlier revision) as missing', () => {
    expect(
      fitHeat(
        runs(300, 0.03, () => false),
        DAY,
      ),
    ).toBeNull()
  })

  it('is a pure function of the runs and the day', () => {
    const points = runs(300, 0.03)
    expect(fitHeat(points, DAY)).toEqual(fitHeat([...points], DAY))
  })
})

/** The planted library's run digests with a temperature and the loss it costs, or without either. */
function warmLibrary(b: number, carries: (i: number) => boolean) {
  const base = plantedLibrary({
    seed: 3,
    weeks: 120,
    perWeek: 3,
    noise: 0.03,
    noiseModel: { autocorrelation: 0.9, heavyTails: true },
    effects: [],
  }).digests
  const random = mulberry32(11)
  const warm = base.map((d, i): ActivityDigest => {
    const day = d.startMs / DAY_MS
    const c =
      Math.round((14 + 9 * Math.sin((2 * Math.PI * day) / 365.25) + 4 * normal(random)) * 2) / 2
    if (!carries(i)) return d
    const slower = Math.exp((b * Math.max(0, c - 12)) / 10)
    const km = d.splits?.km.map((s) =>
      Object.assign({}, s, {
        seconds: s.seconds === null ? null : s.seconds * slower,
        gradeAdjustedSeconds:
          s.gradeAdjustedSeconds === null ? null : s.gradeAdjustedSeconds * slower,
      }),
    )
    const splits = km === undefined ? undefined : Object.assign({}, d.splits, { km })
    return Object.assign({}, d, splits === undefined ? {} : { splits }, {
      temperature: { c, coverage: 1 },
    })
  })
  return warm
}

describe('the term in the fitness status', () => {
  it('is on for a library whose files carry a temperature, says how big it is, and leaves the status otherwise alone', () => {
    const on = fitnessStatuses(
      warmLibrary(0.04, () => true),
      NONE,
    ).run
    expect(on.evidence?.method.heat).toBeGreaterThan(0.01)
    expect(on.state).not.toBe('slipping')
  })

  it('is byte for byte the status without it when under 60% of the runs carry a temperature', () => {
    const sparse = warmLibrary(0.04, (i) => i % 10 < 4)
    // The runs that carry a temperature are slower on warm days, so only the coverage rule keeps the term off.
    const off = fitnessStatuses(sparse, NONE).run
    expect(off.evidence?.method).not.toHaveProperty('heat')
    const stripped = sparse.map((d) => {
      const { temperature: _unused, ...rest } = d
      return rest as ActivityDigest
    })
    expect(fitnessStatuses(stripped, NONE)).toEqual(fitnessStatuses(sparse, NONE))
  })

  it('is byte for byte the status of digests with no temperature at all', () => {
    const plain = plantedLibrary({
      seed: 3,
      weeks: 120,
      perWeek: 3,
      noise: 0.03,
      noiseModel: { autocorrelation: 0.9, heavyTails: true },
      effects: [],
    }).digests
    const first = fitnessStatuses(plain, NONE)
    expect(JSON.stringify(first.run)).not.toContain('heat')
    expect(JSON.stringify(fitnessStatuses([...plain], NONE))).toBe(JSON.stringify(first))
  })
})

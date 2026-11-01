import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { ActivityDigest } from '../types'
import { REVISIONS, withRevisionTable } from '../digest/revisions'
import { fitnessStatuses } from './compute'
import { fitHeat, heatIsOn, heatOf, withoutHeat } from './heat'
import { mulberry32, normal } from '../math'
import type { RunPoint } from './windows'

const NONE: ReadonlySet<string> = new Set()

/** A table in which revision 7 is current and the digests of 6 are read beside them, as when the gate is open. */
const OPEN = [
  ...REVISIONS,
  { revision: 7, kind: 'additive' as const, adds: [], changes: [], affects: [] },
]
const statuses = (digests: ActivityDigest[]) =>
  withRevisionTable(OPEN, () => fitnessStatuses(digests, NONE))

/** `n` runs, one every 3 days, with a seeded index around 14 (swinging 9 over the year) and a loss of `b` per 10 degrees above 12. */
function runs(
  n: number,
  b: number,
  carries: (i: number) => boolean = () => true,
  seed = 3,
): RunPoint[] {
  const random = mulberry32(seed)
  return Array.from({ length: n }, (_, i) => {
    const t = i * 3
    const c =
      Math.round((14 + 9 * Math.sin((2 * Math.PI * t) / 365.25) + 4 * normal(random)) * 2) / 2
    const x = 0.038 * normal(random) - (b * Math.max(0, c - 12)) / 10
    return carries(i) ? { id: `r${i}`, t, x, c } : { id: `r${i}`, t, x }
  })
}
const DAY = 900

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
    expect(slope(points)).toBeLessThan(-0.015)
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

  it('is not on before two years of runs with a temperature, and is after', () => {
    // One run every 3 days: 230 runs span 687 days, 250 span 747.
    expect(heatIsOn(runs(230, 0.03), 230 * 3)).toBe(false)
    expect(heatIsOn(runs(250, 0.03), 250 * 3)).toBe(true)
    // Two years counted from the first run that has a temperature, not from the first run.
    const late = runs(300, 0.03, (i) => i >= 100)
    expect(heatIsOn(late, 300 * 3)).toBe(false)
    expect(
      heatIsOn(
        runs(400, 0.03, (i) => i >= 100),
        400 * 3,
      ),
    ).toBe(true)
  })

  it('is not used when the loss does not stand out from the spread of the runs', () => {
    // No heat effect in any of 30 libraries of three years: the term is used in few of them.
    let used = 0
    for (let seed = 1; seed <= 30; seed++)
      if (
        fitHeat(
          runs(365, 0, () => true, seed),
          1100,
        ) !== null
      )
        used++
    expect(used).toBeLessThanOrEqual(3)
    // A real loss of 3% stands out in most of 10 libraries of three years.
    let found = 0
    for (let seed = 1; seed <= 10; seed++) {
      if (
        fitHeat(
          runs(365, 0.03, () => true, seed),
          1100,
        ) !== null
      )
        found++
    }
    expect(found).toBeGreaterThanOrEqual(8)
  })

  it('goes on at 60%, stays on down to 50%, and goes off below it: no flapping', () => {
    // A library whose share of runs with a temperature moves with time: `share(i)` of run i.
    const library = (share: (i: number) => number) =>
      runs(400, 0.03, (i) => (i * 0.618033) % 1 < share(i), 5)
    // 70% for the first 100 runs, then 55%: still on at the end.
    expect(
      heatIsOn(
        library((i) => (i < 200 ? 0.7 : 0.55)),
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
        library((i) => (i < 200 ? 0.7 : 0.4)),
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
    if (!carries(i)) return Object.assign({}, d, { modelRevision: 7 })
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
      modelRevision: 7,
    })
  })
  return warm
}

describe('the term in the fitness status', () => {
  it('is on for a library whose files carry a temperature, says how big it is, and leaves the status otherwise alone', () => {
    const on = statuses(warmLibrary(0.04, () => true)).run
    expect(on.evidence?.method.heat).toBeGreaterThan(0.01)
    expect(on.state).not.toBe('slipping')
  })

  it('is byte for byte the status without it when under 60% of the runs carry a temperature', () => {
    const sparse = warmLibrary(0.04, (i) => i % 10 < 4)
    // The runs that carry a temperature are slower on warm days, so only the coverage rule keeps the term off.
    const off = statuses(sparse).run
    expect(off.evidence?.method).not.toHaveProperty('heat')
    const stripped = sparse.map((d) => {
      const { temperature: _unused, ...rest } = d
      return rest as ActivityDigest
    })
    expect(statuses(stripped)).toEqual(statuses(sparse))
  })

  it('ignores a temperature on a digest that is not of revision 7', () => {
    const old = warmLibrary(0.04, () => true).map((d) => Object.assign({}, d, { modelRevision: 6 }))
    const run = statuses(old).run
    expect(run.evidence?.method ?? {}).not.toHaveProperty('heat')
    expect(statuses(old)).toEqual(
      statuses(
        old.map((d) => {
          const { temperature: _unused, ...rest } = d
          return rest as ActivityDigest
        }),
      ),
    )
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

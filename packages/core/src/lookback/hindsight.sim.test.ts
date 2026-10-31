import { describe, expect, it, vi } from 'vitest'
import { replaySim, simulate } from '../fitness/test/runSim'
import type { SimSpec } from '../fitness/test/runSim'
import { WEEK_ORIGIN_MS } from '../fitness/machine'
import { DAY_MS } from '../constants'
import { hindsightOf } from './hindsight'
import { meetsLeadBar } from './lead'
import type { HindsightEpisode, HindsightFitness } from './types'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The look-back on simulated libraries (fitness/test/runSim.ts, the spreads of the monitor's acceptance test): how
 * often a library where nothing changes is told to have had an episode, or a lead, and how often a planted change is
 * found and told right. Rates are per library, since that is what an athlete sees: the first library of a friend
 * either lists something that did not happen or it does not. Seeds 5001 up are held out from the 1 to 40 the
 * constants were tuned on.
 */
const RATES = [1.2, 2, 3, 5]
const LIBRARIES = 100
const weekMs = (w: number) => WEEK_ORIGIN_MS + w * 7 * DAY_MS

function told(
  spec: Partial<SimSpec> & Pick<SimSpec, 'weeks'>,
  seed: number,
  withCard = false,
): HindsightFitness | null {
  const runs = simulate({ perWeek: 3, ...spec }, seed)
  // With the card: what the monitor said week by week, which a recovery it confirmed is not called less than back from.
  const records = withCard ? replaySim(runs, spec.weeks) : undefined
  const result = hindsightOf({
    runs,
    activeDays: runs.map((r) => r.t),
    asOfDay: spec.weeks * 7,
    records,
  })
  return result.kind === 'ok' ? result : null
}

/** The share of libraries with any listed episode, and with one that would lead, over the rates. */
function falseRates(spec: Partial<SimSpec>, years: number, libraries = LIBRARIES) {
  let listed = 0
  let leads = 0
  let total = 0
  for (const perWeek of RATES) {
    for (let seed = 1; seed <= libraries; seed++) {
      const result = told({ ...spec, weeks: years * 52, perWeek }, 5000 + seed)
      total++
      if (result === null) continue
      if (result.episodes.length > 0) listed++
      if (result.episodes.some((e) => meetsLeadBar(e, result))) leads++
    }
  }
  return { listed: listed / total, lead: leads / total }
}

describe('libraries where nothing changes: the share that are told an episode, and a lead', () => {
  // Observed (listed / lead), 400 libraries a cell: quiet 5y 0.020 / 0, 10y 0.033 / 0; season 1.5% 0.037 / 0; season 3% 0.030 / 0;
  // strap 3% 0.110 / 0; heat 0.035 / 0; bad runs 0.010 / 0; wander 3% (stress) 5y 0.278 / 0.005, 10y 0.345 / 0.037.
  it.each([
    ['quiet', {}, 5, 0.06, 0.01],
    ['quiet', {}, 10, 0.08, 0.01],
    ['a season of 1.5%', { level: { seasonAmp: 0.015 } }, 5, 0.08, 0.01],
    ['a season of 3%', { level: { seasonAmp: 0.03 } }, 5, 0.08, 0.01],
    [
      'a watch or strap step of 3% (a device step reads as a change)',
      { level: { strapStep: 0.03 } },
      5,
      0.12,
      0.03,
    ],
    ['heat weeks of 3%', { level: { heatDrop: 0.03 } }, 5, 0.07, 0.01],
    ['10% of runs read wrong', { bad: 0.1 }, 5, 0.05, 0.01],
    [
      'a slow wander of 3% (the stress case)',
      { level: { wanderSd: 0.03, wanderRho: 0.95 } },
      5,
      0.45,
      0.04,
    ],
    [
      'a slow wander of 3% (the stress case)',
      { level: { wanderSd: 0.03, wanderRho: 0.95 } },
      10,
      0.45,
      0.04,
    ],
  ] as const)('%s, %i years', (_name, spec, years, listedBudget, leadBudget) => {
    const rates = falseRates(spec, years)
    expect(rates.listed).toBeLessThan(listedBudget)
    expect(rates.lead).toBeLessThan(leadBudget)
  })

  it('does not tell a library whose noise doubles half way through an episode of it', () => {
    let listed = 0
    let total = 0
    for (const perWeek of RATES) {
      for (let seed = 1; seed <= 50; seed++) {
        const a = simulate({ weeks: 156, perWeek, level: { runSd: 0.03 } }, 5000 + seed)
        const b = simulate({ weeks: 156, perWeek, level: { runSd: 0.06 } }, 6000 + seed).map(
          (r) => ({ id: `b${r.id}`, t: r.t + 156 * 7, x: r.x }),
        )
        const runs = [...a, ...b]
        const result = hindsightOf({ runs, activeDays: runs.map((r) => r.t), asOfDay: 312 * 7 })
        total++
        if (result.kind === 'ok' && result.episodes.length > 0) listed++
      }
    }
    // Observed 0.065: a doubling of the run-to-run spread is read as a wider wander by some libraries.
    expect(listed / total).toBeLessThan(0.1)
  })

  it('under two years lists a 5% season as change, as a limit it states: 8% bar, never a lead', () => {
    let listed = 0
    let leads = 0
    let total = 0
    for (const weeks of [70, 90]) {
      for (const perWeek of RATES) {
        for (let seed = 1; seed <= 40; seed++) {
          const result = told({ weeks, perWeek, level: { seasonAmp: 0.05 } }, 5000 + seed)
          total++
          if (result === null) continue
          if (result.episodes.length > 0) listed++
          if (result.episodes.some((e) => meetsLeadBar(e, result))) leads++
        }
      }
    }
    // Observed about 0.2 listed (0.7 at the ordinary 6% bar).
    expect(listed / total).toBeLessThan(0.4)
    expect(leads / total).toBeLessThan(0.1)
  })
})

describe('planted changes', () => {
  const SEEDS = 60

  function found(spec: Partial<SimSpec> & Pick<SimSpec, 'weeks'>, weeks: number[], kind?: string) {
    let hit = 0
    let range = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = told(spec, seed, true)
      if (result === null) continue
      const near = weeks.every((w) =>
        result.episodes.some(
          (e) =>
            Math.abs(e.fromMs - weekMs(w)) < 7 * 7 * DAY_MS ||
            (e.toMs !== null && Math.abs(e.toMs - weekMs(w)) < 7 * 7 * DAY_MS),
        ),
      )
      const kinds = result.episodes.map((e: HindsightEpisode) => e.kind)
      if (near && (kind === undefined || kinds.includes(kind as HindsightEpisode['kind']))) {
        hit++
        const planted = Math.exp(spec.planted![0]!.size) - 1
        const first = result.episodes[0]!
        if (first.change.low <= planted && planted <= first.change.high) range++
      }
    }
    return { hit: hit / SEEDS, range: range / Math.max(1, hit) }
  }

  it.each([
    ['a fall of 8%', -0.08],
    ['a rise of 8%', 0.08],
  ])(
    'finds %s, dated within 7 weeks, in most libraries, with the planted size inside its range',
    (_n, size) => {
      const out = found(
        { weeks: 156, perWeek: 2, planted: [{ type: 'step', week: 70, size }] },
        [70],
      )
      // Observed about 0.9 and 0.9.
      expect(out.hit).toBeGreaterThanOrEqual(0.8)
      expect(out.range).toBeGreaterThanOrEqual(0.85)
    },
  )

  it('finds a dip of 8% for 50 weeks at both edges, as a slip that came back', () => {
    const out = found(
      {
        weeks: 200,
        perWeek: 3,
        planted: [
          { type: 'step', week: 60, size: -0.08 },
          { type: 'step', week: 110, size: 0.08 },
        ],
      },
      [60],
      'slip-back',
    )
    // Observed 0.62. A return is back when it passes the live monitor's back test with the model-error floor (`isBackLevel`)
    // or when the card itself said back for this slip and nothing after contradicts it; the rest are called partly back, and the
    // card had not said back for them either (see agreement.sim.test.ts: the card says back for this dip in 0.46 of libraries,
    // hindsight in 0.69). It was 0.42 on the floor test alone and about 0.7 before the floor.
    expect(out.hit).toBeGreaterThanOrEqual(0.55)
  })

  it('does not claim a step of 3%, and lists one of 5% about two times in five', () => {
    const three = found(
      { weeks: 156, perWeek: 3, planted: [{ type: 'step', week: 70, size: -0.03 }] },
      [70],
    )
    const five = found(
      { weeks: 156, perWeek: 3, planted: [{ type: 'step', week: 70, size: -0.05 }] },
      [70],
    )
    expect(three.hit).toBeLessThan(0.15)
    expect(five.hit).toBeGreaterThan(0.2)
    expect(five.hit).toBeLessThan(0.7)
  })

  it('leads on a fall of 10% or more, and not usually on one of 8%', () => {
    const leadShare = (size: number) => {
      let leads = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const result = told(
          { weeks: 156, perWeek: 3, planted: [{ type: 'step', week: 70, size }] },
          seed,
        )
        if (result?.episodes.some((e) => meetsLeadBar(e, result))) leads++
      }
      return leads / SEEDS
    }
    // Observed 0.95 at 10%, 0.4 at 8%.
    expect(leadShare(-0.1)).toBeGreaterThanOrEqual(0.85)
    expect(leadShare(-0.08)).toBeLessThan(0.7)
  })

  it('does not call back a sparse runner whose return leaves 3.5% missing (a rare strict pass, never usually)', () => {
    for (const perWeek of [0.7, 1.2]) {
      let dipFound = 0
      let back = 0
      for (let seed = 1; seed <= 100; seed++) {
        const result = told(
          {
            weeks: 260,
            perWeek,
            planted: [
              { type: 'step', week: 80, size: -0.08 },
              { type: 'step', week: 150, size: 0.045 },
            ],
          },
          seed,
          true,
        )
        if (result === null) continue
        const dip = result.episodes.find(
          (e) => e.kind !== 'improvement' && Math.abs(e.fromMs - weekMs(80)) < 8 * 7 * DAY_MS,
        )
        if (dip === undefined) continue
        dipFound++
        if (dip.kind === 'slip-back') back++
      }
      expect(back / Math.max(1, dipFound)).toBeLessThanOrEqual(0.15)
    }
  })

  it('keeps a real partial recovery open, with the card consulted: a return that leaves 5.5% missing is not called back', () => {
    let dipFound = 0
    let back = 0
    for (const perWeek of [2, 3, 5]) {
      for (let seed = 1; seed <= 100; seed++) {
        const result = told(
          {
            weeks: 200,
            perWeek,
            planted: [
              { type: 'step', week: 100, size: -0.08 },
              { type: 'step', week: 140, size: 0.025 },
            ],
          },
          seed,
          true,
        )
        const dip = result?.episodes.find(
          (e) => e.kind !== 'improvement' && Math.abs(e.fromMs - weekMs(100)) < 8 * 7 * DAY_MS,
        )
        if (dip === undefined) continue
        dipFound++
        if (dip.kind === 'slip-back') back++
      }
    }
    // Observed 2 of 267 found.
    expect(dipFound).toBeGreaterThan(200)
    expect(back / dipFound).toBeLessThanOrEqual(0.02)
  })
})

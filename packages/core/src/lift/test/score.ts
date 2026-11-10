/**
 * Scores the estimator on synthetic lifters: at each session from day 14 the estimate is held against the
 * true 1RM that day (docs/design/e1rm.md, sections 7 and 8).
 */
import { estimateLift } from '../estimate'
import { population, SCENARIOS } from './scenarios'
import { simulate } from './lifters'
import type { LifterSpec } from './lifters'

export interface ScenarioScore {
  name: string
  /** Median signed error, estimate over truth minus 1. */
  bias: number
  /** Mean of each lifter's share of ranges holding the truth, so a lifter counts once. */
  coverage: number
  /** 1.96 standard errors across lifters. */
  coverageSe: number
  above: number
  below: number
  /** Median range over the truth. */
  width: number
  p90Error: number
  orderViolations: number
  /** Per-lifter coverage, for pooling. */
  lifterCoverage: number[]
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s[Math.floor(s.length / 2)] as number) : NaN
}

/** The days a lifter is scored on: from the first to the last, inclusive. */
function scoreWindow(spec: LifterSpec): [number, number] {
  if (spec.drop) return [(spec.drop[0] + 2) * 7 + 14, (spec.drop[0] + 2) * 7 + 28]
  if (spec.scoreReturn && spec.breakWeeks)
    return [spec.breakWeeks[1] * 7 + 14, spec.breakWeeks[1] * 7 + 28]
  return [14, Infinity]
}

export function scoreScenario(
  name: string,
  lifters: number,
  centre: number,
  offset: number,
): ScenarioScore {
  const errs: number[] = []
  const widths: number[] = []
  const covers: number[] = []
  let n = 0
  let above = 0
  let below = 0
  let orderViolations = 0
  for (const spec of population(name, lifters, centre, offset)) {
    const lifter = simulate(spec)
    // A drop is scored 2 to 4 weeks after it ends, a return 2 to 4 weeks after the break; everything else from day 14.
    const [from, to] = scoreWindow(spec)
    let hit = 0
    let seen = 0
    lifter.sessionDays.forEach((day, i) => {
      if (day < from || day > to) return
      const date = lifter.sessionDates[i] as string
      const e = estimateLift(lifter.sets, date)
      if (!e) return
      const ordered =
        e.floor.loadKg <= e.low + 1e-9 &&
        e.low <= e.point &&
        e.point <= e.high &&
        Number.isFinite(e.point)
      if (!ordered || !Number.isFinite(e.low) || !Number.isFinite(e.high)) orderViolations++
      const t = lifter.truth(date)
      n++
      seen++
      errs.push(e.point / t - 1)
      widths.push((e.high - e.low) / t)
      if (e.low <= t && t <= e.high) hit++
      else if (t > e.high) above++
      else below++
    })
    if (seen) covers.push(hit / seen)
  }
  const coverage = covers.reduce((a, b) => a + b, 0) / covers.length
  const variance =
    covers.reduce((a, b) => a + (b - coverage) ** 2, 0) / (covers.length - 1) / covers.length
  const abs = errs.map(Math.abs).sort((a, b) => a - b)
  return {
    name,
    bias: median(errs),
    coverage,
    coverageSe: 1.96 * Math.sqrt(variance),
    above: above / n,
    below: below / n,
    width: median(widths),
    p90Error: abs[Math.floor(abs.length * 0.9)] as number,
    orderViolations,
    lifterCoverage: covers,
  }
}

export const SCENARIO_NAMES = Object.keys(SCENARIOS)

/** Pooled per-lifter coverage over scenario scores. */
export function pooledCoverage(scores: ScenarioScore[]): number {
  const all = scores.flatMap((s) => s.lifterCoverage)
  return all.reduce((a, b) => a + b, 0) / all.length
}

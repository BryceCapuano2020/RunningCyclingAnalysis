import { quantile } from '../math'
import { FITNESS } from './params'
import type { RunPoint } from './windows'

const H = FITNESS.heat

/**
 * What a warm day costs this athlete: `b` log speed per 10 index degrees above `cRef`. `b` is never negative: a
 * warmer run is not faster, and a fit that says it is reads as no effect.
 */
export interface HeatTerm {
  cRef: number
  b: number
}

/** A run's heat: how far its index stands above the athlete's cooler runs, in tens of degrees. Zero at or below `cRef`. */
export const heatOf = (c: number, cRef: number): number => Math.max(0, c - cRef) / 10

const hasIndex = (r: RunPoint): r is RunPoint & { c: number } => r.c !== undefined

/** The runs with a temperature, in the last `windowDays` before `day`. */
function trailing(
  runs: readonly RunPoint[],
  day: number,
  days: number = H.windowDays,
): (RunPoint & { c: number })[] {
  return runs.filter((r) => r.t > day - days && r.t <= day).filter(hasIndex)
}

/** The reference index and the spread of heat over runs that have one. */
function heatSpan(withIndex: readonly { c: number }[]): { cRef: number; span: number } {
  const cRef = quantile(
    withIndex.map((r) => r.c),
    H.referenceQuantile,
  )
  const heats = withIndex.map((r) => heatOf(r.c, cRef))
  return { cRef, span: Math.max(...heats) - Math.min(...heats) }
}

/**
 * Whether the term is on as of `day`. It comes on when `onShare` of the steady runs of the trailing window carry a
 * temperature, there are `minRuns` of them and their heat spans `minSpan`, and goes off only when the share falls
 * below `offShare`, so a library near the line does not flap. Never before two years of runs with a temperature
 * (`minHistoryDays`). A run of a revision before 7 carries none. The state is
 * replayed run by run, since it depends on how the share moved: a pure function of the runs and the day.
 */
export function heatIsOn(runs: readonly RunPoint[], day: number): boolean {
  const firstDay = runs.find(hasIndex)?.t ?? Number.POSITIVE_INFINITY
  let on = false
  let lo = 0
  let total = 0
  let withIndex = 0
  const check = (at: number): void => {
    while (lo < runs.length && runs[lo]!.t <= at - H.windowDays) {
      total--
      if (hasIndex(runs[lo]!)) withIndex--
      lo++
    }
    const share = total === 0 ? 0 : withIndex / total
    if (on) {
      if (share < H.offShare) on = false
    } else if (at - firstDay >= H.minHistoryDays && share >= H.onShare && withIndex >= H.minRuns) {
      on = heatSpan(trailing(runs.slice(lo), at)).span >= H.minSpan
    }
  }
  for (let i = 0; i < runs.length && runs[i]!.t <= day; i++) {
    total++
    if (hasIndex(runs[i]!)) withIndex++
    check(runs[i]!.t)
  }
  check(day)
  return on
}

/**
 * The slope of value on heat within blocks of `blockDays` days, so the slow level (and the season) cancels and only
 * the day-to-day weather is read; values are clipped around their block's mean. The slope of x on heat is `-b`.
 */
function slopeWithinBlocks(
  rows: readonly { t: number; x: number; h: number }[],
): { slope: number; se: number; n: number } | null {
  const blocks = new Map<number, { t: number; x: number; h: number }[]>()
  for (const row of rows) {
    const key = Math.floor(row.t / H.blockDays)
    blocks.set(key, [...(blocks.get(key) ?? []), row])
  }
  let sxy = 0
  let sxx = 0
  let syy = 0
  let n = 0
  let used = 0
  for (const block of blocks.values()) {
    if (block.length < H.minBlock) continue
    const mh = block.reduce((p, r) => p + r.h, 0) / block.length
    const mx = block.reduce((p, r) => p + r.x, 0) / block.length
    for (const r of block) {
      const dx = Math.max(-H.clip, Math.min(H.clip, r.x - mx))
      sxy += (r.h - mh) * dx
      sxx += (r.h - mh) ** 2
      syy += dx ** 2
      n++
    }
    used++
  }
  const dof = n - used - 1
  if (n === 0 || dof < 1 || sxx / n < H.minHeatSd ** 2) return null
  const slope = sxy / sxx
  return { slope, se: Math.sqrt(Math.max(0, syy - slope * sxy) / dof / sxx), n }
}

/**
 * The athlete's warm-day term as of `day`, or null when it is off (too few runs carry a temperature, or too little
 * heat to read, under two years of runs with a temperature, or hysteresis keeps it off) or no loss stands out
 * (the slope under `minZ` standard errors). `b` is the loss read within blocks, shrunk toward
 * zero by `n / (n + shrinkRuns)` and clamped to [0, maxB].
 */
export function fitHeat(runs: readonly RunPoint[], day: number): HeatTerm | null {
  if (!heatIsOn(runs, day)) return null
  const { cRef } = heatSpan(trailing(runs, day))
  const fit = slopeWithinBlocks(
    trailing(runs, day, H.fitDays).map((r) => ({ t: r.t, x: r.x, h: heatOf(r.c, cRef) })),
  )
  // A loss that does not stand out from the run-to-run spread is not told to the athlete as an adjustment.
  if (fit === null || !(-fit.slope / fit.se >= H.minZ)) return null
  const b = Math.min(H.maxB, Math.max(0, -fit.slope) * (fit.n / (fit.n + H.shrinkRuns)))
  return b < H.minB ? null : { cRef, b }
}

/** The runs with the warm-day loss added back (`x + b * heat`), so a hot day is not read as a slower athlete. Runs with no temperature are as they were. */
export function withoutHeat(runs: readonly RunPoint[], term: HeatTerm | null): readonly RunPoint[] {
  if (term === null) return runs
  return runs.map((r) =>
    r.c === undefined ? r : Object.assign({}, r, { x: r.x + term.b * heatOf(r.c, term.cRef) }),
  )
}

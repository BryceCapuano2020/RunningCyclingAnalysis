import { quantile } from '../math'
import { FITNESS } from './params'
import type { RunPoint } from './windows'

const H = FITNESS.heat

const YEAR_DAYS = 365.25

/** A steady run with the day's warmth as the sensor read it (the digest's `temperature.c`), or null when the file had none. */
export interface HeatRun extends RunPoint {
  c: number | null
}

/**
 * What a warm day cost a run. `cRef` is the athlete's own cooler runs (the sensor reads between skin and air, so
 * the index is only ever read relative to the athlete's own, never against a threshold in degrees) and `b` the
 * log of speed or power lost for every ten index degrees above it, never negative.
 */
export interface HeatTerm {
  cRef: number
  b: number
}

/** The heat of a reading: tens of index degrees above the reference, none below it. */
export const heatOf = (c: number, cRef: number): number => Math.max(0, c - cRef) / H.perDegrees

/** The index of the runs in the window that ends at `end`: the temperatures there, oldest first. */
function windowOf(runs: readonly HeatRun[], end: number): HeatRun[] {
  const start = end - H.windowYears * YEAR_DAYS
  return runs.filter((r) => r.t > start && r.t <= end)
}

const temperaturesOf = (window: readonly HeatRun[]): number[] =>
  window.flatMap((r) => (r.c === null ? [] : [r.c]))

/** Whether a window has the coverage and the spread of heat to turn the term on. */
function canTurnOn(window: readonly HeatRun[]): boolean {
  const temperatures = temperaturesOf(window)
  if (temperatures.length < H.minRuns || temperatures.length / window.length < H.onShare)
    return false
  const cRef = quantile(temperatures, H.refQuantile)
  return heatOf(Math.max(...temperatures), cRef) >= H.minSpan
}

/**
 * Whether the term is on at `day`, walking the weeks so that it turns on at its coverage and stays on until
 * the share falls under the lower mark: a library at the edge does not flap between two answers.
 */
function isOn(runs: readonly HeatRun[], day: number): boolean {
  const firstTemperature = runs.find((r) => r.c !== null)
  if (firstTemperature === undefined) return false
  let on = false
  const marks: number[] = []
  for (let end = Math.ceil(firstTemperature.t / 7) * 7; end <= day; end += 7) marks.push(end)
  if (marks.at(-1) !== day) marks.push(day)
  for (const end of marks) {
    const window = windowOf(runs, end)
    if (window.length === 0) continue
    const share = temperaturesOf(window).length / window.length
    if (on) on = share >= H.offShare
    else on = canTurnOn(window)
  }
  return on
}

/** Least squares of the value on the heat within blocks of days, as `fitHeartRateSlope` fits within blocks: the slope, and the rows it stood on. */
function slopeWithinBlocks(rows: readonly { t: number; h: number; x: number }[]) {
  const blocks = new Map<number, { t: number; h: number; x: number }[]>()
  for (const row of rows) {
    const key = Math.floor(row.t / H.blockDays)
    const block = blocks.get(key) ?? []
    block.push(row)
    blocks.set(key, block)
  }
  let sxy = 0
  let sxx = 0
  let n = 0
  for (const block of blocks.values()) {
    if (block.length < H.minBlock) continue
    const mh = block.reduce((s, r) => s + r.h, 0) / block.length
    const mx = block.reduce((s, r) => s + r.x, 0) / block.length
    for (const r of block) {
      sxy += (r.h - mh) * (r.x - mx)
      sxx += (r.h - mh) ** 2
      n++
    }
  }
  return n === 0 || sxx / n < H.minVariance ? null : { slope: sxy / sxx, n }
}

/**
 * The warm-day term as of `day` (days since the series' origin, runs oldest first), or null: too few of the
 * steady runs carry a temperature, the heat does not vary enough to read, or warm days did not cost the athlete
 * anything. The slope of value on heat is `-b`; a positive slope (warmer runs faster) is `b = 0`, which is no term.
 */
export function heatTerm(runs: readonly HeatRun[], day: number): HeatTerm | null {
  if (!isOn(runs, day)) return null
  const window = windowOf(runs, day).filter((r) => r.c !== null)
  const cRef = quantile(temperaturesOf(window), H.refQuantile)
  const fit = slopeWithinBlocks(window.map((r) => ({ t: r.t, h: heatOf(r.c!, cRef), x: r.x })))
  if (fit === null) return null
  const b = Math.min(H.bMax, Math.max(0, -fit.slope)) * (fit.n / (fit.n + H.n0))
  return b > 0 ? { cRef, b } : null
}

/** The runs with what a warm day cost them added back: `x + b h`. Runs with no temperature are as they were. */
export function withHeat(runs: readonly HeatRun[], term: HeatTerm): RunPoint[] {
  return runs.map(({ id, t, x, c }) => ({
    id,
    t,
    x: c === null ? x : x + term.b * heatOf(c, term.cRef),
  }))
}

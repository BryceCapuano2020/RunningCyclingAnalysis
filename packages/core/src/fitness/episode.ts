import { median } from '../findings/stats'
import { FITNESS } from './params'
import { distinctWeeks, levelOf, slice, trendOver } from './windows'
import type { Level, RunPoint } from './windows'

const M = FITNESS.monitor
const E = FITNESS.episode

/** Where an open episode stands: slipping, on a plateau under the old level (`low`), recovering or back. */
export type Phase = 'slipping' | 'low' | 'recovering' | 'back'

/**
 * A slip that has been declared and is followed until it closes. The reference (the level before it) is
 * frozen at declaration, so a level that settles lower is still measured against the old one.
 */
export interface Episode {
  reference: number
  referenceRuns: number
  sigma: number
  /** The day the change is dated to, or null when no split could be found. */
  onsetDay: number | null
  /** The week it was declared in (reset each time it falls again). */
  declared: number
  phase: Phase
  phaseAt: number | null
  backAt: number
  backRun: number
  riseRun: number
  /** The 20-week levels so far and the adaptive levels so far, for the trough. */
  troughs: { w: number; m: number; se: number; weeks: number }[]
  levels: { w: number; m: number; se: number; weeks: number }[]
}

export function openEpisode(
  week: number,
  sigma: number,
  reference: number,
  referenceRuns: number,
  onsetDay: number | null,
): Episode {
  return {
    reference,
    referenceRuns,
    sigma,
    onsetDay,
    declared: week,
    phase: 'slipping',
    phaseAt: null,
    backAt: 0,
    backRun: 0,
    riseRun: 0,
    troughs: [],
    levels: [],
  }
}

/** The level now over the shortest of `widths` (weeks) that holds `minRuns`. */
export interface EpisodeLevel extends Level {
  weeks: number
  fromDay: number
}

function adaptiveLevel(
  runs: readonly RunPoint[],
  day: number,
  ep: Episode,
  minRuns: number,
  widths: readonly number[],
): EpisodeLevel | null {
  for (const weeks of widths) {
    const rs = slice(runs, day - weeks * 7, day)
    if (rs.length >= minRuns) {
      return { ...levelOf(rs, ep.reference, ep.sigma)!, weeks, fromDay: day - weeks * 7 }
    }
  }
  return null
}

/** The lowest level an episode has had, the week it ended in and the weeks it spans. */
export interface Trough {
  m: number
  se: number
  w: number
  weeks: number
}

/** The lowest the episode has been: the lowest 20-week level when there is one, else the lowest of the shorter levels. */
export function troughOf(ep: Episode): Trough | null {
  const pool = ep.troughs.length > 0 ? ep.troughs : ep.levels
  let low: Trough | null = null
  for (const l of pool) if (low === null || l.m < low.m) low = l
  return low
}

export interface Step {
  /** `thin`: too few runs lately to follow the episode; nothing changes until there are. */
  state: 'thin' | 'slipping' | 'holding' | 'recovering' | 'back'
  /** Holding under the old level rather than level with it. */
  low: boolean
  /** The state began this week. */
  fresh: boolean
  /** The episode is over: the reference is read afresh from the next week. */
  close: boolean
  /** The test statistic behind a fresh state, signed like the change; NaN otherwise. */
  z: number
  /** The level now against the reference. */
  delta: number
  level: EpisodeLevel | null
}

const THIN: Step = {
  state: 'thin',
  low: false,
  fresh: false,
  close: false,
  z: Number.NaN,
  delta: Number.NaN,
  level: null,
}

function step(
  state: Step['state'],
  base: Pick<Step, 'delta' | 'level'>,
  more: Partial<Step> = {},
): Step {
  return { state, low: false, fresh: false, close: false, z: Number.NaN, ...base, ...more }
}

/**
 * The evidence that the level is rising this week, or null. Three rules look for it: a contrast of the
 * last 8, 16 or 26 weeks against the episode's own low, a 26-week trend, and a rise from the 20-week
 * trough. The contrast and the trend must
 * both fire (one alone is too often a stretch of wander), or the trough rule must, on its own and against
 * a high bar, since it compares with the lowest of many levels. Each statistic is taken against a
 * model-error floor that can grow with the episode's age. The strongest statistic that fired is returned.
 */
function riseOf(
  runs: readonly RunPoint[],
  day: number,
  w: number,
  ep: Episode,
  since: number,
  trend: { change: number; se: number } | null,
): number | null {
  const tau = Math.sqrt(E.riseTau ** 2 + E.riseTauGrowth ** 2 * Math.max(0, w - ep.declared))
  const contrastFired: number[] = []
  const troughFired: number[] = []
  let contrast: { z: number; delta: number } | null = null
  for (const weeks of E.riseWindows) {
    const recent = slice(runs, day - weeks * 7, day)
    if (recent.length < M.minRecentRuns + 2) continue
    const base = slice(runs, Math.max(since, day - (weeks + E.riseBaseWeeks) * 7), day - weeks * 7)
    if (base.length < 8 || distinctWeeks(base) < 5) continue
    const mu = median(base.map((r) => r.x))
    const a = levelOf(recent, mu, ep.sigma)!
    const b = levelOf(base, mu, ep.sigma)!
    const delta = a.m - b.m
    const z = delta / Math.sqrt(a.se ** 2 + b.se ** 2 + tau ** 2)
    if (contrast === null || z > contrast.z) contrast = { z, delta }
  }
  if (contrast !== null && contrast.z >= E.zUp && contrast.delta >= E.deltaUp)
    contrastFired.push(contrast.z)
  if (trend !== null) {
    const z = trend.change / Math.sqrt(trend.se ** 2 - M.tau ** 2 + tau ** 2)
    if (trend.change >= E.deltaTrendUp && z >= E.zTrendUp) contrastFired.push(z)
  }
  const l20 = adaptiveLevel(runs, day, ep, E.troughMinRuns, [E.troughWeeks])
  if (l20 !== null) {
    ep.troughs.push({ w, m: l20.m, se: l20.se, weeks: l20.weeks })
    let low: { m: number; se: number } | null = null
    for (const h of ep.troughs)
      if (h.w <= w - E.troughWeeks && (low === null || h.m < low.m)) low = h
    if (low !== null) {
      const delta = l20.m - low.m
      const z = delta / Math.sqrt(l20.se ** 2 + low.se ** 2 + tau ** 2)
      if (delta >= E.deltaTrough && z >= E.zTrough) troughFired.push(z)
    }
  }
  // The contrast and the trend must agree; the trough rule, which compares with the lowest of many levels, has its own high bar.
  const fired =
    contrastFired.length >= E.contrastAgree ? [...contrastFired, ...troughFired] : troughFired
  return fired.length > 0 ? Math.max(...fired) : null
}

/**
 * One weekly step of an open episode (week `w`, evaluated at the end of day `day`): back when a 12-week
 * level has been within tolerance of the reference three weeks running; recovering when the level is rising
 * two weeks running; a plateau under the old level (holding) when 24 weeks show no trend; otherwise slipping.
 */
export function episodeStep(runs: readonly RunPoint[], day: number, w: number, ep: Episode): Step {
  const level = adaptiveLevel(runs, day, ep, E.minRuns, E.levelWeeks)
  if (level === null) return THIN
  const delta = level.m - ep.reference
  const base = { delta, level }
  const refSe = (extra: number) =>
    Math.sqrt(extra ** 2 + (E.medianFactor * ep.sigma) ** 2 / ep.referenceRuns + M.tau ** 2)
  ep.levels.push({ w, m: level.m, se: level.se, weeks: level.weeks })
  // Back: a 12-week level close to the reference and not worse than 2% below it, on 3 weeks running.
  const longer = adaptiveLevel(runs, day, ep, E.backMinRuns, E.backWeeks)
  let backNow = false
  let backSe = Number.NaN
  if (longer !== null) {
    const d = longer.m - ep.reference
    backSe = refSe(longer.se)
    backNow =
      d >= -E.backPoint && d - 1.28 * backSe >= -E.backTol && w - ep.declared >= E.backMinWeeks
  }
  ep.backRun = backNow ? ep.backRun + 1 : 0
  const reslip = (z: number) => {
    ep.phase = 'slipping'
    ep.phaseAt = w
    ep.declared = w
    return step('slipping', base, { fresh: true, z })
  }
  if (ep.phase === 'back') {
    if (!backNow && longer !== null && longer.m - ep.reference < -E.backTol - E.backRelapse) {
      return reslip((longer.m - ep.reference) / backSe)
    }
    if (w - ep.backAt >= E.backHoldWeeks) return step('holding', base, { close: true })
    return step('back', base)
  }
  if (ep.backRun >= E.backConsecutive) {
    ep.phase = 'back'
    ep.backAt = w
    const low = troughOf(ep)
    const z =
      low === null || longer === null
        ? Number.NaN
        : (longer.m - low.m) / Math.sqrt(longer.se ** 2 + low.se ** 2 + M.tau ** 2)
    return step('back', base, { fresh: true, z })
  }
  // Rising: against the runs since the onset, which carry the episode's low.
  const since = (ep.onsetDay ?? 0) + E.riseOnsetSkipDays
  const trend = trendOver(runs, day, 26, ep.sigma, since, E.trendMinRuns, E.trendMinWeeks)
  const rise = riseOf(runs, day, w, ep, since, trend)
  ep.riseRun = rise !== null ? ep.riseRun + 1 : 0
  const falling =
    trend !== null && trend.change <= -E.reslip && trend.change / trend.se <= -E.zReslip
  if (ep.phase === 'recovering') {
    if (falling && w - (ep.phaseAt ?? ep.declared) >= E.dwell)
      return reslip(trend!.change / trend!.se)
    return step('recovering', base)
  }
  if (ep.riseRun >= E.recoverConsecutive) {
    ep.phase = 'recovering'
    ep.phaseAt = w
    return step('recovering', base, { fresh: true, z: rise ?? Number.NaN })
  }
  const flat = trendOver(runs, day, E.trendWeeks, ep.sigma, since, E.trendMinRuns, E.trendMinWeeks)
  if (ep.phase === 'slipping') {
    const settled =
      w - ep.declared >= E.stableWeeks &&
      w - (ep.phaseAt ?? ep.declared) >= E.dwell &&
      flat !== null &&
      Math.abs(flat.change) + 1.28 * flat.se <= E.plateauTol
    if (!settled) return step('slipping', base)
    ep.phase = 'low'
    ep.phaseAt = w
    return step('holding', base, { low: true })
  }
  const fell =
    flat !== null &&
    w - (ep.phaseAt ?? ep.declared) >= E.dwell &&
    flat.change / flat.se <= -E.zReslip &&
    flat.change <= -E.reslip
  if (fell) return reslip(flat!.change / flat!.se)
  return step('holding', base, { low: true })
}

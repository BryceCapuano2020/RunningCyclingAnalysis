import { DAY_MS } from '../constants'
import { FITNESS } from './params'
import { dayOfWeekEnd, WEEK_MS, WEEK_ORIGIN_MS, weekEndOf } from './machine'
import type { MachineState, WeekRecord } from './machine'
import type { UnitSeries } from './unit'
import type {
  FitnessEntry,
  FitnessSpan,
  FitnessState,
  FitnessStatus,
  Ranged,
  Shortfall,
} from './types'
import { levelOf, referenceOf, sigmaAt, slice } from './windows'
import type { RunPoint } from './windows'
import type { Sport } from '../types'

const D = FITNESS.display
const M = FITNESS.monitor
const E = FITNESS.episode

const msOfDay = (day: number) => WEEK_ORIGIN_MS + day * DAY_MS
const exp = Math.exp

function spanOf(rs: readonly RunPoint[]): FitnessSpan {
  return {
    fromMs: rs.length === 0 ? 0 : msOfDay(rs[0]!.t),
    toMs: rs.length === 0 ? 0 : msOfDay(rs.at(-1)!.t),
    runs: rs.length,
    weeks: new Set(rs.map((r) => Math.floor(r.t / 7))).size,
    ids: rs.map((r) => r.id),
  }
}

/** A change in log units with its half-width as a fractional change with its 90% range. */
function ranged(delta: number, half: number): Ranged {
  return { value: exp(delta) - 1, low: exp(delta - half) - 1, high: exp(delta + half) - 1 }
}

const halfWidth = (...ses: number[]) =>
  D.rangeZ * Math.sqrt(ses.reduce((a, s) => a + s * s, 0) + M.rangeTau ** 2)

/** What the status says when it cannot say more. */
function lacking(base: FitnessStatus, shortfall: Shortfall): FitnessStatus {
  return { ...base, state: 'not-enough-evidence', shortfall }
}

/** The week-end at which the shown state began (walking back over weeks of `thin`), and the statistic that began it. */
function enteredAt(records: readonly WeekRecord[]): FitnessEntry | null {
  const last = records.length - 1
  const state = records[last]!.shown
  let first = last
  while (
    first > 0 &&
    (records[first - 1]!.shown === state || records[first - 1]!.shown === 'thin')
  ) {
    first--
  }
  if (first === 0 || state === 'holding') return null
  for (let j = first; j >= Math.max(0, first - 3); j--) {
    const r = records[j]!
    if (r.state === state && r.fresh) return { atMs: weekEndOf(records[first]!.w), z: r.z }
  }
  return { atMs: weekEndOf(records[first]!.w), z: Number.NaN }
}

const NOW_STATES = new Set<FitnessState>(['slipping', 'recovering'])

/** The level over the shortest of the `nowWeeks` stretches that holds enough runs, or the monitor's own level when none does. */
function shortLevel(
  runs: readonly RunPoint[],
  day: number,
  ep: NonNullable<WeekRecord['episode']>,
  sigma: number,
) {
  for (const weeks of D.nowWeeks) {
    const rs = slice(runs, day - weeks * 7, day)
    if (rs.length >= E.minRuns) {
      return { ...levelOf(rs, ep.reference, sigma)!, weeks, fromDay: day - weeks * 7 }
    }
  }
  return ep.level
}

/** The numbers of an episode state, from the latest week the monitor was in that state (or the latest with an episode). */
function episodic(
  base: FitnessStatus,
  state: FitnessState,
  records: readonly WeekRecord[],
  runs: readonly RunPoint[],
): FitnessStatus | null {
  // The latest week the monitor was in this state, else the latest of the last four with an episode open: the
  // display hold can keep a state on screen for a week or two after the monitor has left it.
  const lately = records.slice(-4).filter((x) => x.episode !== null)
  const r = lately.findLast((x) => x.state === state) ?? lately.at(-1)
  if (r === undefined || r.episode === null) return null
  const ep = r.episode
  const sigma = ep.level.se * Math.sqrt(ep.level.n)
  const day = dayOfWeekEnd(r.w)
  // A change is told over the shortest recent stretch with enough runs, so a fresh slip or rise is not
  // averaged with the weeks before it; the monitor's own level (8 to 16 weeks) decided the state.
  const level = NOW_STATES.has(state) ? shortLevel(runs, day, ep, sigma) : ep.level
  const refSe = (E.medianFactor * sigma) / Math.sqrt(ep.referenceRuns)
  const delta = level.m - ep.reference
  const half = halfWidth(level.se, refSe)
  const recent = slice(runs, level.fromDay, day)
  const onsetDay = ep.onsetDay
  const baseline = onsetDay === null ? null : slice(runs, onsetDay - M.onsetBaseWeeks * 7, onsetDay)
  const trough = ep.trough
  const gain =
    (state === 'recovering' || state === 'back') && trough !== null
      ? ranged(level.m - trough.m, halfWidth(level.se, trough.se))
      : null
  return {
    ...base,
    state,
    now: exp(level.m),
    before: exp(ep.reference),
    change: ranged(delta, half),
    gain,
    within: Math.abs(delta) + half,
    onsetMs: onsetDay === null ? null : msOfDay(onsetDay),
    lowMs:
      gain === null || trough === null ? null : weekEndOf(trough.w) - (trough.weeks / 2) * WEEK_MS,
    evidence: {
      ...base.evidence!,
      recent: spanOf(recent),
      baseline: baseline === null ? null : spanOf(baseline),
    },
    shortfall: null,
  }
}

/** Holding with no episode open: the last 8 weeks against the reference window, said only when the level is known to within 6%. */
function calm(base: FitnessStatus, runs: readonly RunPoint[], day: number): FitnessStatus {
  const recent = slice(runs, day - D.recentWeeks * 7, day)
  const before = slice(runs, day - M.refStartWeeks * 7, day - M.refEndWeeks * 7)
  const sigma = sigmaAt(runs, day)
  const reference = referenceOf(runs, day)
  const a = levelOf(recent, reference?.mu ?? 0, sigma)
  const b = levelOf(before, reference?.mu ?? 0, sigma)
  if (a === null || b === null) {
    return lacking(base, {
      kind: 'recent',
      have: recent.length,
      need: D.minRecentRuns,
      weeks: D.recentWeeks,
    })
  }
  const delta = a.m - b.m
  const half = halfWidth(a.se, b.se)
  const within = Math.abs(delta) + half
  if (within > D.maxWithin) return lacking(base, { kind: 'imprecise', within })
  return {
    ...base,
    state: 'holding',
    now: exp(a.m),
    before: exp(b.m),
    change: ranged(delta, half),
    within,
    evidence: { ...base.evidence!, recent: spanOf(recent), baseline: spanOf(before) },
    shortfall: null,
  }
}

/**
 * The status at the last week of a replay. The shown state decides what is told; the thin-evidence tests
 * of the status line come first: 4 steady runs in the last 8 weeks and one in the last 4.
 */
export function describe(
  sport: Sport,
  series: UnitSeries,
  runs: readonly RunPoint[],
  records: readonly WeekRecord[],
  asOfMs: number,
): FitnessStatus {
  const last = records.at(-1)
  const day = last === undefined ? 0 : dayOfWeekEnd(last.w)
  const base: FitnessStatus = {
    sport,
    state: 'not-enough-evidence',
    referenceHr: series.referenceHr,
    now: null,
    before: null,
    change: null,
    gain: null,
    within: null,
    onsetMs: null,
    lowMs: null,
    evidence: {
      recent: spanOf([]),
      baseline: null,
      method: series.method,
    },
    shortfall: null,
    entered: null,
    steady: runs.length,
    asOfMs,
  }
  if (last === undefined || last.shown === 'nodata') {
    const earlier = slice(runs, day - M.refStartWeeks * 7, day - M.refEndWeeks * 7)
    return lacking(base, {
      kind: 'history',
      have: earlier.length,
      need: M.minRefRuns,
      weeks: spanOf(earlier).weeks,
      needWeeks: M.minRefWeeks,
    })
  }
  const lately = slice(runs, day - D.recentWeeks * 7, day)
  const newest = runs.at(-1)
  const weeksSince =
    newest === undefined ? Infinity : Math.floor((asOfMs - msOfDay(newest.t)) / WEEK_MS)
  if (last.shown === 'thin') {
    const wide = slice(runs, day - E.levelWeeks.at(-1)! * 7, day)
    return lacking(base, {
      kind: 'recent',
      have: wide.length,
      need: E.minRuns,
      weeks: E.levelWeeks.at(-1)!,
    })
  }
  if (weeksSince >= D.breakWeeks) return lacking(base, { kind: 'break', weeksSince })
  if (lately.length < D.minRecentRuns) {
    return lacking(base, {
      kind: 'recent',
      have: lately.length,
      need: D.minRecentRuns,
      weeks: D.recentWeeks,
    })
  }
  const shown: MachineState = last.shown
  const entered = enteredAt(records)
  const told =
    (shown === 'holding' ? null : episodic(base, shown as FitnessState, records, runs)) ??
    calm(base, runs, day)
  // Only the state the monitor has begun is entered; a calm status told while the display lags is not.
  return told.state === shown ? { ...told, entered } : told
}

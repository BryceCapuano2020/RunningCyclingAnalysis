import { DAY_MS } from '../constants'
import { WEEK_ORIGIN_MS } from '../fitness/machine'
import { fitSeason, withoutSeason } from '../fitness/season'
import { pointOf } from '../fitness/series'
import { slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { episodesOf } from './episodes'
import type { WeekEpisode, WeekSpan } from './episodes'
import { LOOKBACK } from './params'
import { quietLevels } from './quiet'
import { segmentLevels, sigmaOver } from './segments'
import type { Level, Segmented } from './segments'
import type { HindsightEpisode, HindsightFitness, Plateau, Span, TooShort } from './types'

const L = LOOKBACK
const msOfWeek = (week: number) => WEEK_ORIGIN_MS + week * 7 * DAY_MS
const spanOf = (s: WeekSpan): Span => ({ fromMs: msOfWeek(s.fromWeek), toMs: msOfWeek(s.toWeek) })

/** What a sport's years are read from. */
export interface HindsightInput {
  /** The steady runs, in time order, as the unit read them (before any seasonal swing is taken out). */
  runs: readonly RunPoint[]
  /** Days (since the origin) of every run of the sport, steady or not, and not set aside: a break is a gap in these. */
  activeDays: readonly number[]
  /** The newest activity's day: the years are told through `horizonWeeks` before it. */
  asOfDay: number
}

/** The days since the origin of the horizon, a whole number of weeks. */
export const horizonDay = (asOfDay: number): number => Math.floor(asOfDay / 7 - L.horizonWeeks) * 7

/** What the runs have of what a sport's years need, and whether it is enough. */
function shortfall(
  runs: readonly RunPoint[],
  endDay: number,
): { counts: TooShort; enough: boolean } {
  const own = slice(runs, Number.NEGATIVE_INFINITY, endDay)
  const weeks = own.length === 0 ? 0 : Math.max(0, Math.floor((endDay - own[0]!.t) / 7))
  const { changes } = sigmaOver(own)
  return {
    counts: {
      kind: 'too-short',
      steady: own.length,
      weeks,
      needSteady: L.minimum.runs,
      needWeeks: L.minimum.weeks,
    },
    enough:
      own.length >= L.minimum.runs && weeks >= L.minimum.weeks && changes >= L.minimum.changes,
  }
}

/** What is missing before a sport's years can be told, or null when nothing is. */
export function shortOf(runs: readonly RunPoint[], endDay: number): TooShort | null {
  const { counts, enough } = shortfall(runs, endDay)
  return enough ? null : counts
}

/** Eight weeks or more between consecutive days in the list (and, for `until`, up to it). */
function gapsIn(days: readonly number[], minWeeks: number): WeekSpan[] {
  const out: WeekSpan[] = []
  for (let i = 1; i < days.length; i++) {
    const a = Math.floor(days[i - 1]! / 7)
    const b = Math.floor(days[i]! / 7)
    if (b - a >= minWeeks) out.push({ fromWeek: a + 1, toWeek: b })
  }
  return out
}

/** Whether an activity falls inside a span of weeks. */
const holdsActivity = (span: WeekSpan, days: readonly number[]) =>
  days.some((d) => d >= span.fromWeek * 7 && d < span.toWeek * 7)

/**
 * The series the plateaus are cut from: the runs with the athlete's own swing through the year taken out, when two years show
 * one. The swing is fitted on the runs as they are, the plateaus cut, then the swing fitted again on the runs less the level
 * of their plateau (so a real step inside the fit window does not leak into the swing), and the plateaus cut again. Two
 * passes are the limit; a library under two full years has no swing to take out.
 */
function plateausOf(
  runs: readonly RunPoint[],
  endDay: number,
  bar: { delta: number; z: number },
): Segmented | null {
  const season = fitSeason(runs, endDay)
  if (season === null) return segmentLevels(runs, endDay, bar)
  const first = segmentLevels(
    withoutSeason(runs, season, Number.NEGATIVE_INFINITY, Infinity),
    endDay,
    bar,
  )
  if (first === null || first.levels.length < 2) return first
  const centre =
    first.levels.reduce((total, l) => total + l.m * l.n, 0) /
    first.levels.reduce((n, l) => n + l.n, 0)
  const levelAt = (t: number) => {
    const week = Math.floor(t / 7)
    const level = first.levels.find((l) => week >= l.fromWeek && week < l.toWeek)
    return level === undefined ? 0 : level.m - centre
  }
  const flat = runs.map((r) => ({ ...r, x: r.x - levelAt(r.t) }))
  const again = fitSeason(flat, endDay)
  if (again === null) return first
  return (
    segmentLevels(withoutSeason(runs, again, Number.NEGATIVE_INFINITY, Infinity), endDay, bar) ??
    first
  )
}

const dated = (e: WeekEpisode): HindsightEpisode => ({
  kind: e.kind,
  fromMs: msOfWeek(e.fromWeek),
  toMs: e.toWeek === null ? null : msOfWeek(e.toWeek),
  change: e.change,
  regained: e.regained,
  remaining: e.remaining,
  z: e.z,
  steps: e.steps,
  runs: e.runs,
})

/** The longest `cap` of the spans, kept in date order, and how many were dropped. */
function longest<T extends Span>(spans: T[], cap: number): { kept: T[]; dropped: number } {
  if (spans.length <= cap) return { kept: spans, dropped: 0 }
  const keep = new Set(
    [...spans].sort((a, b) => b.toMs - b.fromMs - (a.toMs - a.fromMs)).slice(0, cap),
  )
  return { kept: spans.filter((s) => keep.has(s)), dropped: spans.length - cap }
}

/**
 * A sport's years in hindsight, told through the horizon: its plateaus, the slips, returns and improvements between
 * them, the stretches that were quiet, and the stretches with no steady runs and none at all. A library short of
 * `minimum` has only the counts it lacks. Under `list.shortWeeks` of data no season can be told from change, so only
 * a step of `list.shortDelta` or more is listed.
 */
export function hindsightOf(input: HindsightInput): HindsightFitness | TooShort {
  const endDay = horizonDay(input.asOfDay)
  const { counts, enough } = shortfall(input.runs, endDay)
  if (!enough) return counts
  const runs = slice(input.runs, Number.NEGATIVE_INFINITY, endDay)
  const weeks = (endDay - runs[0]!.t) / 7
  const bar = {
    delta: weeks < L.list.shortWeeks ? L.list.shortDelta : L.list.delta,
    z: L.list.z,
  }
  const plateaus = plateausOf(runs, endDay, bar)
  if (plateaus === null) return counts
  const { levels, sigma, floor } = plateaus
  const active = input.activeDays.filter((d) => d < endDay)
  const breaks = gapsIn(active, L.gapWeeks)
  const thin = gapsIn(
    runs.map((r) => r.t),
    L.gapWeeks,
  ).filter((g) => holdsActivity(g, active))
  const episodes = episodesOf(levels, breaks, floor, bar.delta).map(dated)
  const keepEpisodes = [...episodes]
    .sort((a, b) => Math.abs(b.change.value) - Math.abs(a.change.value) || b.fromMs - a.fromMs)
    .slice(0, L.caps.episodes)
  const quiet = quietLevels(levels, runs, sigma, [...breaks, ...thin]).map(({ index, within }) => ({
    fromMs: msOfWeek(levels[index]!.fromWeek),
    toMs: msOfWeek(levels[index]!.toWeek),
    within,
    runs: levels[index]!.n,
  }))
  const quietCut = longest(quiet, L.caps.spans)
  const thinCut = longest(thin.map(spanOf), L.caps.spans)
  const breakCut = longest(breaks.map(spanOf), L.caps.spans)
  const toMs = msOfWeek(Math.floor(endDay / 7))
  const plateau = (l: Level): Plateau => {
    const point = pointOf({ m: l.m, se: l.se, n: l.n }, msOfWeek(l.toWeek), l.toWeek - l.fromWeek)
    return {
      fromMs: msOfWeek(l.fromWeek),
      toMs: msOfWeek(l.toWeek),
      value: point.value,
      low: point.low,
      high: point.high,
      runs: l.n,
    }
  }
  return {
    kind: 'ok',
    fromMs: msOfWeek(levels[0]!.fromWeek),
    toMs,
    runs: runs.length,
    levels: levels.map(plateau),
    episodes: episodes.filter((e) => keepEpisodes.includes(e)),
    omittedEpisodes: episodes.length - keepEpisodes.length,
    quiet: quietCut.kept,
    thin: thinCut.kept,
    breaks: breakCut.kept,
    omittedSpans: quietCut.dropped + thinCut.dropped + breakCut.dropped,
  }
}

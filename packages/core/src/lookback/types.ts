/**
 * The look-back: a sport's years of fitness at the same effort, told in hindsight. Plain data, small whatever the
 * library's size (no list grows with weeks or activities past its cap), and told only through the horizon.
 */

/** A stretch of calendar time. */
export interface Span {
  fromMs: number
  toMs: number
}

/** A span of weeks since the origin with no run of any kind. */
export interface WeekSpan {
  fromWeek: number
  toWeek: number
}

/** A level the steady runs held for a stretch, with its 90% range, in the unit of the status (m/s for a run, W for a ride). */
export interface Plateau extends Span {
  value: number
  low: number
  high: number
  runs: number
}

export interface QuietStretch extends Span {
  /** How far from level the runs allow the athlete to have been over it (log units, as FitnessStatus.within). */
  within: number
  runs: number
}

export interface HindsightFitness {
  kind: 'ok'
  fromMs: number
  /** The horizon the years are told through. */
  toMs: number
  runs: number
  /** The plateaus, oldest first; weaker neighbours are merged past the cap, so nothing is dropped, only coarser. */
  levels: Plateau[]
  quiet: QuietStretch[]
  /** Eight weeks or more with runs but no steady run. */
  thin: Span[]
  /** Eight weeks or more with no run of any kind. */
  breaks: Span[]
  omittedSpans: number
}

/** Why a sport has no years to tell yet, with the counts so the page can say what is missing. */
export interface TooShort {
  kind: 'too-short'
  steady: number
  weeks: number
  needSteady: number
  needWeeks: number
}

export type SportYears = HindsightFitness | TooShort | { kind: 'unavailable' }

/** What a best is measured in: a run's flat speed (m/s, which the page writes as a pace), a ride's power, or a time. */
export type MilestoneUnit = 'm/s' | 'W' | 'W/kg' | 's'

export type MilestoneEffort =
  { kind: 'duration'; durationS: number } | { kind: 'distance'; distanceM: number }

export interface Mark {
  value: number
  atMs: number
  /** The activity that set it. */
  id: string
}

/** One effort's bests over the years: demonstrated, never capability. */
export interface EffortMilestones {
  effort: MilestoneEffort
  unit: MilestoneUnit
  /** The best there is, and since when it has stood. */
  best: Mark
  /** The best of each calendar year (UTC) that has one, oldest first, at most `caps.years`; the oldest are dropped and counted. */
  years: { year: number; partial: boolean; value: number; id: string; n: number }[]
  omittedYears: number
  /** The largest jumps of the all-time best, oldest first, at most `caps.steps`. */
  steps: { atMs: number; value: number; previous: number; id: string }[]
  /** Each complete calendar year against the one before it, by the change test; only durations are tested. */
  verdicts: { year: number; verdict: 'higher' | 'lower' | 'none' | 'untested' }[]
}

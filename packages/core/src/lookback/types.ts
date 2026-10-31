import type { Ranged } from '../fitness/types'

/**
 * The look-back: a sport's years of fitness at the same effort, told in hindsight. Plain data, small whatever the
 * library's size (no list grows with weeks or activities past its cap), and told only through the horizon.
 */

/** A stretch of calendar time. */
export interface Span {
  fromMs: number
  toMs: number
}

/** A level the steady runs held for a stretch, with its 90% range, in the unit of the status (m/s for a run, W for a ride). */
export interface Plateau extends Span {
  value: number
  low: number
  high: number
  runs: number
}

export type EpisodeKind =
  /** Fell, and is back: the level after the return passes the test a live "back" must (see FITNESS.episode). */
  | 'slip-back'
  /** Fell and came part of the way back; `remaining` is what is still missing. */
  | 'slip-partly-back'
  /** Fell and had not come back by the horizon. */
  | 'slip-open'
  /** Rose and held. */
  | 'improvement'
  /** The level changed beside a break of 8 weeks or more with no run at all. */
  | 'after-break'

export interface HindsightEpisode {
  kind: EpisodeKind
  fromMs: number
  /** When the last step ended; null for a slip still open at the horizon. */
  toMs: number | null
  /** The change the episode made, against the level before it. */
  change: Ranged
  /** A slip that came back: how much of it. */
  regained: Ranged | null
  /** A slip that came only part of the way back: where the level stands against the level before the fall. */
  remaining: Ranged | null
  /** The statistic of the whole change against the floor, in standard errors, signed like the change. */
  z: number
  /** Steps it took (a slide or a build is one episode of several). */
  steps: number
  /** Steady runs from the start of the first step to the end of the last. */
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
  episodes: HindsightEpisode[]
  omittedEpisodes: number
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

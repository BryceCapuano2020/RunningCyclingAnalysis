import type { OutputAtHeartRate } from './theilSen'
import type { Sport } from '../types'

/**
 * What stops a week reporting, in the order it is checked: too few blocks, too few activities, the
 * activities all in too few weeks, heart rate that hardly varies (so output cannot be told apart from
 * the heart rate it is read at), or a reference heart rate outside the window's own range. A period
 * whose steady stretches do not reach a window's length into the period has no week to report at all.
 */
export type Lack = 'blocks' | 'activities' | 'weeks' | 'spread' | 'range' | 'period'

export interface SameHeartRateWeek {
  /** End of the week, as a trend's: Sunday 23:59:59.999 UTC. The window is the 28 days to it. */
  endMs: number
  /** Output at the reference heart rate with its 90% interval; null when the week lacks something. */
  fit: OutputAtHeartRate | null
  lacks: Lack | null
  /** Blocks in the window, and the activities they come from. */
  blocks: number
  activities: number
}

/** The first and last reported weeks. A change is real only when their intervals do not overlap. */
export interface SameHeartRateChange {
  fromEndMs: number
  toEndMs: number
  /** Output at the reference heart rate in each, in the sport's unit: m/s for a run, W for a ride. */
  from: number
  to: number
  /** Whole weeks between the two, nearest. */
  weeksApart: number
  /** to / from - 1. */
  relative: number
  real: boolean
}

export interface SameHeartRate {
  /** Fixed for the whole period, bpm, rounded to 5; null without a block. */
  referenceHeartRate: number | null
  /** Every week from the first that can be reported to the last, reporting or not. */
  weeks: SameHeartRateWeek[]
  /** Null with fewer than two reported weeks. */
  change: SameHeartRateChange | null
  /** What is missing, when there is no change to give. */
  lacks: Lack | null
  /**
   * The end of the period's last week: the Sunday of its newest activity, of either sport. A change
   * reaching it is "now"; one ending earlier is of an earlier week. Null without a block.
   */
  latestWeekEndMs: number | null
}

export type SameHeartRateBySport = Record<Sport, SameHeartRate>

const NOTHING: SameHeartRate = {
  referenceHeartRate: null,
  weeks: [],
  change: null,
  lacks: 'blocks',
  latestWeekEndMs: null,
}

/** Nothing to report in either sport: the state before any analysis. Frozen, since every empty state shares it. */
export const NO_SAME_HEART_RATE: SameHeartRateBySport = Object.freeze({
  run: NOTHING,
  ride: NOTHING,
})

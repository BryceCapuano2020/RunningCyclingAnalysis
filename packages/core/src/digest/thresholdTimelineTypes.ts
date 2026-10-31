import { DAY_MS } from '../constants'
import type { CriticalPowerFit, Sport } from '../types'
import { weekEndFor } from '../calendar'
import type { Dated } from '../calendar'

/** The trailing window a threshold is fitted over, in weeks: about half a year of the athlete's efforts. */
export const THRESHOLD_WINDOW_WEEKS = 26

/** How long an older fit is still used, in days, when the window can no longer support one: 12 months. */
export const STALE_THRESHOLD_DAYS = 365

/**
 * One sport's threshold from `fromMs` on, until the next step. A week's window holds the efforts of the
 * `THRESHOLD_WINDOW_WEEKS` weeks that end with it, and its fit changes only in a week an activity enters or
 * leaves the window, so a step is kept for those weeks alone. Plain data, so the session can post it.
 */
export interface ThresholdStep {
  /** The end of the first week this step holds for (`weekEndFor`), ms. */
  fromMs: number
  /** The threshold of the window, as the analysis reports a fit (a refused fit is null); gross metabolic W/kg. */
  fit: CriticalPowerFit | null
  /** The start of the newest activity in the window with an effort of about 20 minutes or longer, ms; null for a window with none. */
  asOfMs: number | null
  /** The index of the last step at or before this one that has a fit (itself when it has), -1 for none. */
  lastFit: number
}

/** Each sport's threshold over time; a sport with no efforts has no steps. */
export type ThresholdTimeline = Record<Sport, ThresholdStep[]>

export const NO_THRESHOLD_TIMELINE: ThresholdTimeline = { run: [], ride: [] }

/** The threshold in effect on a date, and when it is from if it is not the date's own window's. */
export interface ThresholdAt {
  fit: CriticalPowerFit
  /** Null for a fit over the window ending at the date. Otherwise the start of the newest activity of the older fit. */
  asOfMs: number | null
}

/**
 * The threshold in effect at an instant: the fit over the window that ends with the instant's week, or, when
 * that window cannot support one, the newest earlier fit whose activities end within `STALE_THRESHOLD_DAYS`.
 * Null when neither exists.
 */
export function thresholdAt(
  steps: readonly ThresholdStep[],
  at: number | Dated,
): ThresholdAt | null {
  const end = weekEndFor(typeof at === 'number' ? { startMs: at } : at)
  let low = 0
  let high = steps.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (steps[mid]!.fromMs <= end) {
      found = mid
      low = mid + 1
    } else high = mid - 1
  }
  const step = steps[found]
  if (step === undefined) return null
  if (step.fit !== null) return { fit: step.fit, asOfMs: null }
  const older = steps[step.lastFit]
  if (older?.fit == null || older.asOfMs === null) return null
  const startMs = typeof at === 'number' ? at : at.startMs
  return startMs - older.asOfMs <= STALE_THRESHOLD_DAYS * DAY_MS
    ? { fit: older.fit, asOfMs: older.asOfMs }
    : null
}

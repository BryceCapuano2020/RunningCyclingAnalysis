import { DAY_MS } from '../constants'
import type { CriticalPowerFit, Sport } from '../types'
import { weekEndFor } from '../calendar'
import type { Dated } from '../calendar'

/** The trailing window a threshold is fitted over, in weeks: about half a year of the athlete's efforts. */
export const THRESHOLD_WINDOW_WEEKS = 26

/** How long an older fit is still used, in days, when the window can no longer support one: 12 months. */
export const STALE_THRESHOLD_DAYS = 365

/**
 * What the zones read of a threshold: its value, `cp`, and the standard error of it, in gross metabolic W/kg. It is the sport's
 * threshold estimate over a window (`rideThreshold`, `runThreshold`) and the power estimate's own relative error times it.
 */
export type ThresholdFit = Pick<CriticalPowerFit, 'cp' | 'cpSe'>

/**
 * One sport's threshold from `fromMs` on, until the next step. A week's window holds the efforts of the
 * `THRESHOLD_WINDOW_WEEKS` weeks that end with it, and its fit changes only in a week an activity enters or
 * leaves the window, so a step is kept for those weeks alone. Plain data, so the session can post it.
 */
export interface ThresholdStep {
  /** The end of the first week this step holds for (`weekEndFor`), ms. */
  fromMs: number
  /**
   * The threshold of the window (null for a window with no effort its sport reads: 3 min or more for a ride, 8 for a run);
   * gross metabolic W/kg.
   */
  fit: ThresholdFit | null
  /** The start of the newest activity in the window with an effort its sport reads, ms; null for a window with none. */
  asOfMs: number | null
  /** The index of the last step at or before this one that has a fit (itself when it has), -1 for none. */
  lastFit: number
  /**
   * The end of the last week of the window `fit` was taken over, ms (a week end, see `weekEndFor`), or the end of the day of the
   * newest activity the sport's steps read where that is earlier: a week still running has not reached its Sunday. Absent in the
   * timeline as built, where a step's fit is its own window's and this is `fromMs`. The settled timeline the zones read sets it: it
   * holds an earlier window's fit through a step whose own fit is within error of it, so the fit's window is not the step's.
   */
  windowEndMs?: number
}

/** Each sport's threshold over time; a sport with no efforts has no steps. */
export type ThresholdTimeline = Record<Sport, ThresholdStep[]>

export const NO_THRESHOLD_TIMELINE: ThresholdTimeline = { run: [], ride: [] }

/** The threshold in effect on a date, and when it is from if it is not the date's own window's. */
export interface ThresholdAt {
  fit: ThresholdFit
  /** Null for a fit over the window ending at the date. Otherwise the start of the newest activity of the older fit. */
  asOfMs: number | null
  /** The end of the window the fit was taken over, ms (a week end, or an earlier day): `ThresholdStep.windowEndMs`, else `fromMs`. */
  windowEndMs: number
}

/** The index of the step in effect at an instant: the last whose week has ended by the instant's week's end, -1 for none. */
function stepIndexAt(steps: readonly ThresholdStep[], at: number | Dated): number {
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
  return found
}

/** The end of the last week of the window a step's fit was taken over (see `ThresholdStep.windowEndMs`). */
function windowEndOf(step: ThresholdStep): number {
  return step.windowEndMs ?? step.fromMs
}

/**
 * The threshold in effect at an instant: the fit over the window that ends with the instant's week, or, when
 * that window cannot support one, the newest earlier fit whose activities end within `STALE_THRESHOLD_DAYS`. Null when none exists.
 */
export function thresholdAt(
  steps: readonly ThresholdStep[],
  at: number | Dated,
): ThresholdAt | null {
  const step = steps[stepIndexAt(steps, at)]
  if (step === undefined) return null
  if (step.fit !== null) return { fit: step.fit, asOfMs: null, windowEndMs: windowEndOf(step) }
  const older = steps[step.lastFit]
  if (older?.fit == null || older.asOfMs === null) return null
  const startMs = typeof at === 'number' ? at : at.startMs
  return startMs - older.asOfMs <= STALE_THRESHOLD_DAYS * DAY_MS
    ? { fit: older.fit, asOfMs: older.asOfMs, windowEndMs: windowEndOf(older) }
    : null
}

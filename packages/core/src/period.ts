import { DAY_MS } from './constants'
import type { ActivityDigest } from './types'
import { dayOf, dayStartMs, isCustomChoice, orderedRange } from './customRange'
import type { CustomRange } from './customRange'

/**
 * The longest number of days a period can count back over: a century. Past it a window would date
 * outside the calendar the app can show, so such a choice is refused.
 */
export const MAX_PERIOD_DAYS = 36_500

/** The default period is the latest window of this many weeks that holds a run and a ride. */
export const DEFAULT_PERIOD_WEEKS = 12
export const DEFAULT_PERIOD_DAYS = DEFAULT_PERIOD_WEEKS * 7

/**
 * A period the athlete can pick: the default window, a number of days back from the newest activity,
 * all time, or a custom range of days the athlete names. The stored preference and the period control
 * both use this.
 */
export type PeriodChoice = 'default' | 'all' | number | CustomRange

/**
 * The period on screen. Its dates are inclusive, and both are null for an empty library. `days` is
 * the length, null for all time, which has no period before it. `fellBack` says that no window of
 * the default length holds both sports, so the default shows all time.
 */
export interface Period {
  choice: PeriodChoice
  startMs: number | null
  endMs: number | null
  days: number | null
  fellBack: boolean
}

export interface Periods {
  period: Period
  /** The digests in the period; every visible digest for all time. */
  selected: ActivityDigest[]
  /** The digests in the period before it, of the same length. Empty for all time. */
  previous: ActivityDigest[]
}

/** Whether a sorted list holds a value between from and to, both inclusive. */
function holds(sorted: readonly number[], from: number, to: number): boolean {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (sorted[middle]! < from) low = middle + 1
    else high = middle
  }
  return low < sorted.length && sorted[low]! <= to
}

/**
 * The periods are counted in calendar days of the device's local zone: a day runs from its first
 * millisecond to its last, so the hour an activity starts does not move the window it falls in.
 */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** The last millisecond of the local day that holds ms, so a period ends with its last day. */
export function endOfLocalDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

/** The choice a value names: a period the control offers or a custom range, and undefined for anything else. */
export function periodChoiceOf(value: unknown): PeriodChoice | undefined {
  if (value === 'default' || value === 'all') return value
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_PERIOD_DAYS
  ) {
    return value
  }
  return isCustomChoice(value) ? orderedRange(value) : undefined
}

/** Whether two choices name the same period: the same word or number, or the same two days. */
export function sameChoice(a: PeriodChoice, b: PeriodChoice): boolean {
  if (typeof a === 'object' && typeof b === 'object') return a.from === b.from && a.to === b.to
  return a === b
}

/**
 * Whether two periods are one regime: windows of the same length, or both all time, or the same custom days. A figure
 * read under one regime and a figure read under another are of different stretches of the library, so a difference
 * between them is not the athlete changing. The default period is a regime of its own that all time can stand in for
 * (`fellBack`), which is why it is read from the period's length and not from the choice that named it.
 */
export function sameRegime(a: Period, b: Period): boolean {
  if (typeof a.choice === 'object' || typeof b.choice === 'object') {
    return (
      typeof a.choice === 'object' && typeof b.choice === 'object' && sameChoice(a.choice, b.choice)
    )
  }
  return a.days === b.days
}

/** The first and last day of a period, as `YYYY-MM-DD`, or null when it has no dates. */
export function periodDays(period: Period): CustomRange | null {
  if (period.startMs === null || period.endMs === null) return null
  return { from: dayOf(period.startMs), to: dayOf(period.endMs) }
}

/** The instant that falls the given number of local calendar days before ms, at the same time of day. */
function daysBefore(ms: number, days: number): number {
  const date = new Date(ms)
  date.setDate(date.getDate() - days)
  return date.getTime()
}

/** The local calendar days from the day of startMs to the day of endMs, both counted. */
function calendarDays(startMs: number, endMs: number): number {
  return Math.round((startOfLocalDay(endMs) - startOfLocalDay(startMs)) / DAY_MS) + 1
}

/**
 * The window of `days` local calendar days that ends on the newest activity's day: from the first
 * millisecond of its first day to the last millisecond of its last day.
 */
export function windowEnding(newestMs: number, days: number): { startMs: number; endMs: number } {
  return {
    startMs: daysBefore(startOfLocalDay(newestMs), days - 1),
    endMs: endOfLocalDay(newestMs),
  }
}

/**
 * The default window: the 12 weeks up to the newest activity's day, when they hold a run and a ride.
 * It always ends on the newest day, so it never hides recent activities behind an older window. It is
 * clipped to the first activity's day, so a library shorter than the cap is dated from its start.
 */
function defaultWindow(
  visible: readonly ActivityDigest[],
): { startMs: number; endMs: number } | null {
  const starts = visible.map((d) => d.startMs)
  const earliest = starts.reduce((low, s) => Math.min(low, s), Infinity)
  const newest = starts.reduce((high, s) => Math.max(high, s), -Infinity)
  const window = windowEnding(newest, DEFAULT_PERIOD_DAYS)
  const runs = visible
    .filter((d) => d.sport === 'run')
    .map((d) => d.startMs)
    .sort((a, b) => a - b)
  const rides = visible
    .filter((d) => d.sport === 'ride')
    .map((d) => d.startMs)
    .sort((a, b) => a - b)
  if (!holds(runs, window.startMs, window.endMs) || !holds(rides, window.startMs, window.endMs)) {
    return null
  }
  return { startMs: Math.max(window.startMs, startOfLocalDay(earliest)), endMs: window.endMs }
}

/** The period a choice names, dated from the visible digests. */
export function periodOf(visible: readonly ActivityDigest[], choice: PeriodChoice): Period {
  const ordered = typeof choice === 'object' ? orderedRange(choice) : choice
  if (visible.length === 0)
    return { choice: ordered, startMs: null, endMs: null, days: null, fellBack: false }
  const first = visible.reduce((low, d) => Math.min(low, d.startMs), Infinity)
  const newest = visible.reduce((high, d) => Math.max(high, d.startMs), -Infinity)
  const endMs = endOfLocalDay(newest)
  const allTime = { choice, startMs: first, endMs, days: null, fellBack: false }
  if (choice === 'all') return allTime
  if (choice === 'default') {
    const window = defaultWindow(visible)
    if (window === null) return { ...allTime, fellBack: true }
    return { choice, ...window, days: calendarDays(window.startMs, window.endMs), fellBack: false }
  }
  if (typeof choice === 'object') return customPeriod(choice)
  return { choice, ...windowEnding(newest, choice), days: choice, fellBack: false }
}

/**
 * The period of a custom range: from the first millisecond of its first day to the last of its last,
 * with the days in order. Not clipped to the library, so a range outside it is empty, not refused.
 */
function customPeriod(choice: CustomRange): Period {
  const range = orderedRange(choice)
  const startMs = dayStartMs(range.from)
  const lastDay = dayStartMs(range.to)
  if (startMs === null || lastDay === null) {
    return { choice: range, startMs: null, endMs: null, days: null, fellBack: false }
  }
  const endMs = endOfLocalDay(lastDay)
  return { choice: range, startMs, endMs, days: calendarDays(startMs, endMs), fellBack: false }
}

/**
 * Splits the visible digests into the period and the one before it, of the same length in calendar
 * days. A period that counts back from a number of days ends at the newest activity's day, not today,
 * so an old export still shows its last weeks.
 */
export function splitPeriods(visible: ActivityDigest[], choice: PeriodChoice): Periods {
  const period = periodOf(visible, choice)
  const { startMs, endMs, days } = period
  if (startMs === null || endMs === null) return { period, selected: [], previous: [] }
  const selected = visible.filter((d) => d.startMs >= startMs && d.startMs <= endMs)
  if (days === null) return { period, selected, previous: [] }
  const previousStartMs = daysBefore(startOfLocalDay(startMs), days)
  const previous = visible.filter((d) => d.startMs >= previousStartMs && d.startMs < startMs)
  return { period, selected, previous }
}

/**
 * The items started within a number of calendar days before the newest one's day, the same window a
 * period counts over. All of them for all time (null), so an activity list can narrow without losing any.
 */
export function startedWithin<T extends { startMs: number }>(
  items: readonly T[],
  days: number | null,
): T[] {
  if (days === null || items.length === 0) return [...items]
  const newest = items.reduce((high, item) => Math.max(high, item.startMs), -Infinity)
  const { startMs } = windowEnding(newest, days)
  return items.filter((item) => item.startMs >= startMs)
}

export { PeriodCache, sameDigests } from './periodCache'

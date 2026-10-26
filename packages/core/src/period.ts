import { DAY_MS, HEADLINE_DURATION_S } from './constants'
import { sportCurves } from './digest/combine'
import { fitnessTrend } from './digest/trend'
import type { TrendPoint } from './digest/trend'
import { EFFORT_LENGTHS_S, trendWindowDays } from './digest/trendPoints'
import type { EffortLengthS } from './digest/trendPoints'
import type { ActivityDigest, AthleteSettings, BikeModel, HrCrossCheck, SportCurves } from './types'

/** The default period is the latest window of this many weeks that holds a run and a ride. */
export const DEFAULT_PERIOD_WEEKS = 12
export const DEFAULT_PERIOD_DAYS = DEFAULT_PERIOD_WEEKS * 7

/**
 * A period the athlete can pick: the default window, a number of days back from the newest activity,
 * or all time. The stored preference and the period control both use this.
 */
export type PeriodChoice = 'default' | 'all' | number

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
  if (visible.length === 0)
    return { choice, startMs: null, endMs: null, days: null, fellBack: false }
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
  return { choice, ...windowEnding(newest, choice), days: choice, fellBack: false }
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

/** Whether two lists hold the same digest objects in the same order. */
export function sameDigests(a: ActivityDigest[], b: ActivityDigest[]): boolean {
  return a.length === b.length && a.every((digest, i) => digest === b[i])
}

/** The masses and digests that a cached result was computed from. */
interface Inputs {
  selected: ActivityDigest[]
  massKg: number
  bikeMassKg: number
}

function sameInputs(
  cached: Inputs,
  selected: ActivityDigest[],
  settings: AthleteSettings,
): boolean {
  return (
    cached.massKg === settings.massKg &&
    cached.bikeMassKg === settings.bikeMassKg &&
    sameDigests(cached.selected, selected)
  )
}

/**
 * The trend and the previous period's curves, reused between calls while their inputs are the same.
 * Both are priced with the bike model of the selected period, which depends only on the selected
 * digests and the masses, so those are the whole key. The heart-rate model behind the running
 * equivalents also depends only on the selected digests and the masses, so it needs no key of its
 * own; whether the equivalents are wanted does, and it is in the key.
 */
export class PeriodCache {
  private trendEntries = new Map<
    EffortLengthS,
    Inputs & { rangeDays: number | null; equivalence: boolean; points: TrendPoint[] }
  >()
  private previousEntry: (Inputs & { previous: ActivityDigest[]; curves: SportCurves }) | null =
    null

  /**
   * The weekly trend of each effort length over the selected period, reused while its inputs are the
   * same. The headline trend also carries each week's running equivalent, with the heart-rate model
   * of the selected analysis, when hr is given.
   */
  trends(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
    hr: HrCrossCheck | undefined,
  ): Record<EffortLengthS, TrendPoint[]> {
    return Object.fromEntries(
      EFFORT_LENGTHS_S.map((durationS) => [
        durationS,
        this.trend(selected, settings, rangeDays, startMs, bikeModel, durationS, hr),
      ]),
    ) as Record<EffortLengthS, TrendPoint[]>
  }

  /** The weekly trend of one effort length: a third of the period in each window, within the period. */
  private trend(
    selected: ActivityDigest[],
    settings: AthleteSettings,
    rangeDays: number | null,
    startMs: number | null,
    bikeModel: BikeModel | undefined,
    durationS: EffortLengthS,
    hr: HrCrossCheck | undefined,
  ): TrendPoint[] {
    const equivalence = hr !== undefined && durationS === HEADLINE_DURATION_S
    const cached = this.trendEntries.get(durationS)
    if (
      cached &&
      cached.rangeDays === rangeDays &&
      cached.equivalence === equivalence &&
      sameInputs(cached, selected, settings)
    ) {
      return cached.points
    }
    const points = fitnessTrend(selected, settings, {
      durationS,
      windowDays: trendWindowDays(rangeDays),
      fromMs: startMs ?? undefined,
      bikeModel,
      equivalence: equivalence && hr !== undefined ? { hr } : undefined,
    })
    this.trendEntries.set(durationS, {
      selected,
      ...masses(settings),
      rangeDays,
      equivalence,
      points,
    })
    return points
  }

  /** The curves of the period before, priced with the selected period's bike model. */
  previousCurves(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    bikeModel: BikeModel,
  ): SportCurves {
    const cached = this.previousEntry
    if (
      cached !== null &&
      sameInputs(cached, selected, settings) &&
      sameDigests(cached.previous, previous)
    ) {
      return cached.curves
    }
    const curves = sportCurves(previous, settings, bikeModel)
    this.previousEntry = { selected, ...masses(settings), previous, curves }
    return curves
  }
}

function masses(settings: AthleteSettings): { massKg: number; bikeMassKg: number } {
  return { massKg: settings.massKg, bikeMassKg: settings.bikeMassKg }
}

import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { movingTimeOf } from './activityFigures'
import { formatCount } from './format/count'
import { formatDayMonth, formatMonth } from './format/date'
import { plural } from './components/plural'
import { SPORT_ACTIVITY, SPORT_ORDER, SPORT_PLURAL } from './sports'

/**
 * What the Activities list's volume strip and month headers add up: the activities in each calendar week
 * or month, as time and distance by sport. It reads the summaries the list already holds, so no trace is
 * loaded, and it never changes a figure: it only sums what each row shows.
 */

/** A set of up to this many weeks is drawn week by week; a longer one month by month. */
export const WEEKLY_MAX_WEEKS = 26

const DAY_MS = 86_400_000
const SECONDS_PER_HOUR = 3600
const WEEK_PREFIX = 'w:'
const MONTH_PREFIX = 'm:'

export type BucketKind = 'week' | 'month'

/** The activity count, moving seconds and metres of one sport. */
export interface SportTotals {
  count: number
  seconds: number
  distanceM: number
}

export type TotalsBySport = Record<Sport, SportTotals>

/** One column of the strip: a week or a month, and what was trained in it. */
export interface VolumeBucket {
  /** Names the bucket in the address: `w:2025-5-2` for the week starting Monday 2 Jun, `m:2025-5` for June. */
  key: string
  kind: BucketKind
  startMs: number
  /** The first millisecond after the bucket. */
  endMs: number
  totals: TotalsBySport
}

export function emptyTotals(): TotalsBySport {
  return Object.fromEntries(
    SPORT_ORDER.map((sport) => [sport, { count: 0, seconds: 0, distanceM: 0 }]),
  ) as TotalsBySport
}

function addTo(totals: TotalsBySport, activity: ActivitySummary): void {
  const sport = totals[activity.sport]
  sport.count += 1
  sport.seconds += movingTimeOf(activity)
  sport.distanceM += activity.distanceM
}

/** All sports' activities counted. */
export function countOf(totals: TotalsBySport): number {
  return SPORT_ORDER.reduce((sum, sport) => sum + totals[sport].count, 0)
}

/** All sports' moving seconds. */
export function secondsOf(totals: TotalsBySport): number {
  return SPORT_ORDER.reduce((sum, sport) => sum + totals[sport].seconds, 0)
}

/** The calendar month of a moment in the viewer's zone, as the list's month headings group by. */
export function monthKeyOf(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth()}`
}

/** The Monday, 00:00 local, of the week a moment falls in. */
function weekStartOf(ms: number): number {
  const date = new Date(ms)
  const sinceMonday = (date.getDay() + 6) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday).getTime()
}

function weekKey(startMs: number): string {
  const date = new Date(startMs)
  return `${WEEK_PREFIX}${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function monthStartOf(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

/** The start of the week or month after the one that starts at `startMs`. */
function nextStart(kind: BucketKind, startMs: number): number {
  const date = new Date(startMs)
  return kind === 'week'
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime()
    : new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

/** Whether the activities reach back further than a weekly strip is drawn for. */
export function bucketKindFor(oldestMs: number, newestMs: number): BucketKind {
  return (newestMs - oldestMs) / (7 * DAY_MS) > WEEKLY_MAX_WEEKS ? 'month' : 'week'
}

/**
 * The strip's columns, oldest first, from the week or month of the oldest activity to that of the newest.
 * A stretch with no training is a column of its own with nothing in it, so the axis is honest about time.
 * Empty for no activities.
 */
export function volumeBuckets(activities: readonly ActivitySummary[]): VolumeBucket[] {
  if (activities.length === 0) return []
  let oldest = Infinity
  let newest = -Infinity
  for (const activity of activities) {
    oldest = Math.min(oldest, activity.startMs)
    newest = Math.max(newest, activity.startMs)
  }
  const kind = bucketKindFor(oldest, newest)
  const startOf = kind === 'week' ? weekStartOf : monthStartOf
  const keyOf = kind === 'week' ? weekKey : (ms: number) => `${MONTH_PREFIX}${monthKeyOf(ms)}`
  const buckets: VolumeBucket[] = []
  const byKey = new Map<string, VolumeBucket>()
  for (let start = startOf(oldest); start <= newest; start = nextStart(kind, start)) {
    const bucket = {
      key: keyOf(start),
      kind,
      startMs: start,
      endMs: nextStart(kind, start),
      totals: emptyTotals(),
    }
    buckets.push(bucket)
    byKey.set(bucket.key, bucket)
  }
  for (const activity of activities) {
    const bucket = byKey.get(keyOf(startOf(activity.startMs)))
    if (bucket !== undefined) addTo(bucket.totals, activity)
  }
  return buckets
}

/** Whole numbers split from a key's tail, or null when it holds anything else. */
function numbersOf(text: string, count: number): number[] | null {
  const numbers = text.split('-').map(Number)
  const whole = numbers.every((n) => Number.isInteger(n) && n >= 0)
  return numbers.length === count && whole ? numbers : null
}

/** The span a bucket key names, or null for a key that is not one. Anything the address holds may be wrong. */
export function bucketSpan(key: string): Pick<VolumeBucket, 'kind' | 'startMs' | 'endMs'> | null {
  if (key.startsWith(WEEK_PREFIX)) {
    const [year, month, day] = numbersOf(key.slice(WEEK_PREFIX.length), 3) ?? []
    if (year === undefined || month === undefined || day === undefined) return null
    const startMs = new Date(year, month, day).getTime()
    if (Number.isNaN(startMs)) return null
    return { kind: 'week', startMs, endMs: nextStart('week', startMs) }
  }
  if (key.startsWith(MONTH_PREFIX)) {
    const [year, month] = numbersOf(key.slice(MONTH_PREFIX.length), 2) ?? []
    if (year === undefined || month === undefined || month > 11) return null
    const startMs = new Date(year, month, 1).getTime()
    return { kind: 'month', startMs, endMs: nextStart('month', startMs) }
  }
  return null
}

/** The items that started in the span a bucket key names; all of them for no key or one that is not valid. */
export function inBucket<T extends { startMs: number }>(items: T[], key: string | null): T[] {
  const span = key === null ? null : bucketSpan(key)
  if (span === null) return items
  return items.filter((item) => item.startMs >= span.startMs && item.startMs < span.endMs)
}

/** The bucket's name for a chip or a label: "week of 3 Jun 2025", or "Jun 2025". */
export function bucketLabel(bucket: Pick<VolumeBucket, 'kind' | 'startMs'>): string {
  const year = new Date(bucket.startMs).getFullYear()
  return bucket.kind === 'week'
    ? `week of ${formatDayMonth(bucket.startMs, bucket.startMs)} ${year}`
    : formatMonth(bucket.startMs, true)
}

/** Hours as the strip writes them: a decimal under 10, whole above, so "3.2 h" and "61 h". */
export function formatHoursText(seconds: number): string {
  const hours = seconds / SECONDS_PER_HOUR
  return `${hours >= 10 ? formatCount(hours) : hours.toFixed(1)} h`
}

/** The activities, summed for each calendar month, by the month's key. */
export function monthTotals(activities: readonly ActivitySummary[]): Map<string, TotalsBySport> {
  const months = new Map<string, TotalsBySport>()
  for (const activity of activities) {
    const key = monthKeyOf(activity.startMs)
    let totals = months.get(key)
    if (totals === undefined) {
      totals = emptyTotals()
      months.set(key, totals)
    }
    addTo(totals, activity)
  }
  return months
}

/** "38 runs and 12 rides": each sport that has an activity, in the order sports sit everywhere. */
export function countsText(totals: TotalsBySport): string {
  return SPORT_ORDER.filter((sport) => totals[sport].count > 0)
    .map((sport) => plural(totals[sport].count, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport]))
    .join(' and ')
}

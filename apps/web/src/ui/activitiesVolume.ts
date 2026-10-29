import { COMPRESS_AFTER_WEEKS } from '@rca/core/digest/trendSeries'
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
const QUARTER_PREFIX = 'q:'

export type BucketKind = 'week' | 'month' | 'quarter'

/** The activity count, moving seconds and metres of one sport. */
export interface SportTotals {
  count: number
  seconds: number
  distanceM: number
}

export type TotalsBySport = Record<Sport, SportTotals>

/** One column of the strip: a week or a month, and what was trained in it. */
export interface VolumeBucket {
  /** Names the bucket in the address: `w:2025-5-2` for the week starting Monday 2 Jun, `m:2025-5` for June, `q:2025-1` for April to June. */
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

/** The calendar quarter's first month: January, April, July or October. */
function quarterStartOf(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1).getTime()
}

const MONTHS_IN: Record<Exclude<BucketKind, 'week'>, number> = { month: 1, quarter: 3 }

/** The start of the week, month or quarter after the one that starts at `startMs`. */
function nextStart(kind: BucketKind, startMs: number): number {
  const date = new Date(startMs)
  return kind === 'week'
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime()
    : new Date(date.getFullYear(), date.getMonth() + MONTHS_IN[kind], 1).getTime()
}

const START_OF: Record<BucketKind, (ms: number) => number> = {
  week: weekStartOf,
  month: monthStartOf,
  quarter: quarterStartOf,
}

function keyOf(kind: BucketKind, startMs: number): string {
  if (kind === 'week') return weekKey(startMs)
  const date = new Date(startMs)
  return kind === 'month'
    ? `${MONTH_PREFIX}${monthKeyOf(startMs)}`
    : `${QUARTER_PREFIX}${date.getFullYear()}-${Math.floor(date.getMonth() / 3)}`
}

/**
 * The grain a strip is drawn at: the week up to 26 weeks, the month beyond. A phone draws a long stretch by the
 * quarter, since a month's column would be a couple of pixels wide there.
 */
export function bucketKindFor(oldestMs: number, newestMs: number, phone = false): BucketKind {
  if ((newestMs - oldestMs) / (7 * DAY_MS) <= WEEKLY_MAX_WEEKS) return 'week'
  return phone ? 'quarter' : 'month'
}

/**
 * The strip's columns, oldest first, from the week or month of the oldest activity to that of the newest.
 * A stretch with no training is a column of its own with nothing in it, so the axis is honest about time.
 * Empty for no activities.
 */
export function volumeBuckets(
  activities: readonly ActivitySummary[],
  phone = false,
): VolumeBucket[] {
  if (activities.length === 0) return []
  let oldest = Infinity
  let newest = -Infinity
  for (const activity of activities) {
    oldest = Math.min(oldest, activity.startMs)
    newest = Math.max(newest, activity.startMs)
  }
  const kind = bucketKindFor(oldest, newest, phone)
  const startOf = START_OF[kind]
  const buckets: VolumeBucket[] = []
  const byKey = new Map<string, VolumeBucket>()
  for (let start = startOf(oldest); start <= newest; start = nextStart(kind, start)) {
    const bucket = {
      key: keyOf(kind, start),
      kind,
      startMs: start,
      endMs: nextStart(kind, start),
      totals: emptyTotals(),
    }
    buckets.push(bucket)
    byKey.set(bucket.key, bucket)
  }
  for (const activity of activities) {
    const bucket = byKey.get(keyOf(kind, startOf(activity.startMs)))
    if (bucket !== undefined) addTo(bucket.totals, activity)
  }
  return buckets
}

/** Whole numbers of up to four digits split from a key's tail, or null when it holds anything else. */
function numbersOf(text: string, count: number): number[] | null {
  const parts = text.split('-')
  if (parts.length !== count || !parts.every((part) => /^\d{1,4}$/.test(part))) return null
  return parts.map(Number)
}

/** The bucket a key names, whole: null when its dates are not real, so nothing here can throw a RangeError. */
function spanOf(
  kind: BucketKind,
  startMs: number,
): Pick<VolumeBucket, 'kind' | 'startMs' | 'endMs'> | null {
  const endMs = nextStart(kind, startMs)
  return Number.isNaN(startMs) || Number.isNaN(endMs) ? null : { kind, startMs, endMs }
}

/** The span a bucket key names, or null for a key that is not one. Anything the address holds may be wrong. */
export function bucketSpan(key: string): Pick<VolumeBucket, 'kind' | 'startMs' | 'endMs'> | null {
  if (key.startsWith(WEEK_PREFIX)) {
    const [year, month, day] = numbersOf(key.slice(WEEK_PREFIX.length), 3) ?? []
    if (year === undefined || month === undefined || day === undefined) return null
    if (month > 11 || day < 1 || day > 31) return null
    return spanOf('week', new Date(year, month, day).getTime())
  }
  if (key.startsWith(MONTH_PREFIX)) {
    const [year, month] = numbersOf(key.slice(MONTH_PREFIX.length), 2) ?? []
    if (year === undefined || month === undefined || month > 11) return null
    return spanOf('month', new Date(year, month, 1).getTime())
  }
  if (key.startsWith(QUARTER_PREFIX)) {
    const [year, quarter] = numbersOf(key.slice(QUARTER_PREFIX.length), 2) ?? []
    if (year === undefined || quarter === undefined || quarter > 3) return null
    return spanOf('quarter', new Date(year, quarter * 3, 1).getTime())
  }
  return null
}

/** The items that started in the span a bucket key names; all of them for no key or one that is not valid. */
export function inBucket<T extends { startMs: number }>(
  items: readonly T[],
  key: string | null,
): readonly T[] {
  const span = key === null ? null : bucketSpan(key)
  if (span === null) return items
  return items.filter((item) => item.startMs >= span.startMs && item.startMs < span.endMs)
}

/** The bucket's name for a chip or a label: "week of 3 Jun 2025", "Jun 2025" or "Apr to Jun 2025". */
export function bucketLabel(bucket: Pick<VolumeBucket, 'kind' | 'startMs'>): string {
  const year = new Date(bucket.startMs).getFullYear()
  if (bucket.kind === 'week')
    return `week of ${formatDayMonth(bucket.startMs, bucket.startMs)} ${year}`
  if (bucket.kind === 'month') return formatMonth(bucket.startMs, true)
  const last = nextStart('quarter', bucket.startMs) - 1
  return `${formatMonth(bucket.startMs, false)} to ${formatMonth(last, true)}`
}

/** The bucket as a phrase after "in": "the week of 3 Jun 2025", "Jun 2025" or "Apr to Jun 2025". */
export function bucketInPhrase(bucket: Pick<VolumeBucket, 'kind' | 'startMs'>): string {
  return bucket.kind === 'week' ? `the ${bucketLabel(bucket)}` : bucketLabel(bucket)
}

/** A column of the strip: a week, month or quarter, or a stretch of a year or more with none that the strip skips. */
export type VolumeColumn =
  { kind: 'bucket'; bucket: VolumeBucket } | { kind: 'gap'; fromMs: number; toMs: number }

/**
 * The strip's columns with each stretch of a year or more with no training between two that have some folded
 * into one gap column, as the trend's time axis skips such a stretch, so a long quiet start does not take
 * the width. Shorter quiet stretches stay as empty columns, so the axis is true to time.
 */
export function volumeColumns(buckets: readonly VolumeBucket[]): VolumeColumn[] {
  const columns: VolumeColumn[] = []
  let quiet: VolumeBucket[] = []
  const flush = () => {
    const first = quiet[0]
    const last = quiet.at(-1)
    if (
      first !== undefined &&
      last !== undefined &&
      last.endMs - first.startMs >= COMPRESS_AFTER_WEEKS * 7 * DAY_MS
    ) {
      columns.push({ kind: 'gap', fromMs: first.startMs, toMs: last.endMs })
    } else {
      for (const bucket of quiet) columns.push({ kind: 'bucket', bucket })
    }
    quiet = []
  }
  for (const bucket of buckets) {
    if (countOf(bucket.totals) === 0) {
      quiet.push(bucket)
      continue
    }
    flush()
    columns.push({ kind: 'bucket', bucket })
  }
  // Buckets run from the first activity to the last, so none is quiet at either end.
  flush()
  return columns
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

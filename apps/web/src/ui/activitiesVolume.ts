import {
  civilOfDay,
  dayOfCivil,
  localDayOf,
  localDayOfInstant,
  localYearOf,
  mondayOnOrBefore,
  startOfDayNumber,
} from '@rca/core/calendar'
import type { Dated } from '@rca/core/calendar'
import { COMPRESS_AFTER_WEEKS, MONTHLY_AFTER_WEEKS } from '@rca/core/digest/trendSeries'
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

const DAY_MS = 86_400_000
const SECONDS_PER_HOUR = 3600
const WEEK_PREFIX = 'w:'
const MONTH_PREFIX = 'm:'
const QUARTER_PREFIX = 'q:'
/** No activity file predates this; Date also reads a year under 100 as 19xx, so a short year is never real. */
const MIN_YEAR = 1970

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

/** The month a day number is in, as the list's month headings group by: `2025-5` for June 2025. */
export function monthKeyOfDay(day: number): string {
  const { year, month } = civilOfDay(day)
  return `${year}-${month}`
}

/** The calendar month of a moment in the viewer's zone, as the list's month headings group by. */
export function monthKeyOf(ms: number): string {
  return monthKeyOfDay(localDayOfInstant(ms))
}

/** The first day of the week, month or quarter that holds a day. */
function startDayOf(kind: BucketKind, day: number): number {
  if (kind === 'week') return mondayOnOrBefore(day)
  const { year, month } = civilOfDay(day)
  return dayOfCivil(year, kind === 'month' ? month : Math.floor(month / 3) * 3, 1)
}

/** The first day of the week, month or quarter after the one that starts on `day`. */
function nextStartDay(kind: BucketKind, day: number): number {
  if (kind === 'week') return day + 7
  const { year, month } = civilOfDay(day)
  return dayOfCivil(year, month + MONTHS_IN[kind], 1)
}

const MONTHS_IN: Record<Exclude<BucketKind, 'week'>, number> = { month: 1, quarter: 3 }

/** The key a bucket that starts on a day is named by. */
function keyOfDay(kind: BucketKind, day: number): string {
  const { year, month, date } = civilOfDay(day)
  if (kind === 'week') return `${WEEK_PREFIX}${year}-${month}-${date}`
  return kind === 'month'
    ? `${MONTH_PREFIX}${year}-${month}`
    : `${QUARTER_PREFIX}${year}-${Math.floor(month / 3)}`
}

/**
 * The grain a strip is drawn at: the week up to 26 weeks, the month beyond. A phone draws a long stretch by the
 * quarter, since a month's column would be a couple of pixels wide there.
 */
export function bucketKindFor(oldestMs: number, newestMs: number, phone = false): BucketKind {
  if ((newestMs - oldestMs) / (7 * DAY_MS) <= MONTHLY_AFTER_WEEKS) return 'week'
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
  let oldestDay = Infinity
  let newestDay = -Infinity
  for (const activity of activities) {
    const day = localDayOf(activity)
    oldest = Math.min(oldest, activity.startMs)
    newest = Math.max(newest, activity.startMs)
    oldestDay = Math.min(oldestDay, day)
    newestDay = Math.max(newestDay, day)
  }
  const kind = bucketKindFor(oldest, newest, phone)
  const buckets: VolumeBucket[] = []
  const byKey = new Map<string, VolumeBucket>()
  for (let day = startDayOf(kind, oldestDay); day <= newestDay; day = nextStartDay(kind, day)) {
    const bucket = {
      key: keyOfDay(kind, day),
      kind,
      startMs: startOfDayNumber(day),
      endMs: startOfDayNumber(nextStartDay(kind, day)),
      totals: emptyTotals(),
    }
    buckets.push(bucket)
    byKey.set(bucket.key, bucket)
  }
  for (const activity of activities) {
    const bucket = byKey.get(keyOfDay(kind, startDayOf(kind, localDayOf(activity))))
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
  startDay: number,
  key: string,
): Pick<VolumeBucket, 'kind' | 'startMs' | 'endMs'> | null {
  // A key that is not the one its own start would be named by was written by hand: `w:2025-5-2` is real
  // but `w:2025-05-02`, `w:2025-5-32` (which rolls over) and a week that starts on a Tuesday are not.
  if (startDayOf(kind, startDay) !== startDay || keyOfDay(kind, startDay) !== key) return null
  return {
    kind,
    startMs: startOfDayNumber(startDay),
    endMs: startOfDayNumber(nextStartDay(kind, startDay)),
  }
}

/** The span a bucket key names, or null for a key that is not one. Anything the address holds may be wrong. */
export function bucketSpan(key: string): Pick<VolumeBucket, 'kind' | 'startMs' | 'endMs'> | null {
  if (key.startsWith(WEEK_PREFIX)) {
    const [year, month, day] = numbersOf(key.slice(WEEK_PREFIX.length), 3) ?? []
    if (year === undefined || month === undefined || day === undefined) return null
    if (year < MIN_YEAR || month > 11 || day < 1 || day > 31) return null
    return spanOf('week', dayOfCivil(year, month, day), key)
  }
  if (key.startsWith(MONTH_PREFIX)) {
    const [year, month] = numbersOf(key.slice(MONTH_PREFIX.length), 2) ?? []
    if (year === undefined || month === undefined || year < MIN_YEAR || month > 11) return null
    return spanOf('month', dayOfCivil(year, month, 1), key)
  }
  if (key.startsWith(QUARTER_PREFIX)) {
    const [year, quarter] = numbersOf(key.slice(QUARTER_PREFIX.length), 2) ?? []
    if (year === undefined || quarter === undefined || year < MIN_YEAR || quarter > 3) return null
    return spanOf('quarter', dayOfCivil(year, quarter * 3, 1), key)
  }
  return null
}

/** The items that started in the span a bucket key names; all of them for no key or one that is not valid. */
export function inBucket<T extends Dated>(items: readonly T[], key: string | null): readonly T[] {
  const span = key === null ? null : bucketSpan(key)
  if (span === null) return items
  // By local day, as the buckets are filled, so a row is in the bucket whose column counted it.
  const from = localDayOfInstant(span.startMs)
  const to = localDayOfInstant(span.endMs)
  return items.filter((item) => localDayOf(item) >= from && localDayOf(item) < to)
}

/** The bucket's name for a chip or a label: "week of 3 Jun 2025", "Jun 2025" or "Apr to Jun 2025". */
export function bucketLabel(bucket: Pick<VolumeBucket, 'kind' | 'startMs'>): string {
  const year = localYearOf(bucket.startMs)
  if (bucket.kind === 'week')
    return `week of ${formatDayMonth(bucket.startMs, bucket.startMs)} ${year}`
  if (bucket.kind === 'month') return formatMonth(bucket.startMs, true)
  const next = nextStartDay('quarter', localDayOfInstant(bucket.startMs))
  return `${formatMonth(bucket.startMs, false)} to ${formatMonth(startOfDayNumber(next) - 1, true)}`
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
    const key = monthKeyOfDay(localDayOf(activity))
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

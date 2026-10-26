import { DAY_MS } from '@rca/core/constants'
import { formatMonth } from '../format/date'
import type { AxisTick } from './chartTypes'
import type { Scale } from './scale'

/** Spans shorter than this many days label each sample's week; longer ones label month starts. */
const WEEKLY_LABEL_SPAN_DAYS = 92
/** A month start this close to the first or last sample is left out, so the two ends stay readable. */
const END_CLEARANCE_MS = 14 * DAY_MS

/**
 * The local-zone noon on the UTC calendar date of ms. A trend's weeks end on UTC Sundays, so naming
 * them through this names the same day in every zone.
 */
export function utcDayLocal(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12).getTime()
}

/** The UTC day of an instant and its month, such as "12 Jan". */
export function shortDate(ms: number): string {
  return `${new Date(ms).getUTCDate()} ${formatMonth(utcDayLocal(ms), false)}`
}

/** First instants of the calendar months, in UTC, that fall after fromMs and up to toMs. */
function monthStartsBetween(fromMs: number, toMs: number): number[] {
  const from = new Date(fromMs)
  const starts: number[] = []
  for (let month = from.getUTCMonth() + 1; ; month++) {
    const start = Date.UTC(from.getUTCFullYear(), month, 1)
    if (start > toMs) return starts
    starts.push(start)
  }
}

/**
 * The date-axis ticks of a trend whose samples end at endsMs, in ascending order. A short span
 * labels every sample's week. A longer one labels the month starts between the first and last
 * samples, and always the first and last samples themselves.
 */
export function trendDateTicks(endsMs: readonly number[], x: Scale): AxisTick[] {
  const first = endsMs[0]
  const last = endsMs.at(-1)
  if (first === undefined || last === undefined || endsMs.length < 2) return []
  if ((last - first) / DAY_MS < WEEKLY_LABEL_SPAN_DAYS) {
    return endsMs.map((ms) => ({ position: x(ms), label: shortDate(ms) }))
  }
  const months = monthStartsBetween(first, last)
    .filter((ms) => ms - first >= END_CLEARANCE_MS && last - ms >= END_CLEARANCE_MS)
    .map((ms) => ({ position: x(ms), label: formatMonth(utcDayLocal(ms), true) }))
  return [
    { position: x(first), label: shortDate(first) },
    ...months,
    { position: x(last), label: shortDate(last) },
  ]
}

import {
  civilOfDay,
  localDayOfInstant,
  noonOnLabelDate,
  startOfDayNumber,
} from '@rca/core/calendar'
import { DAY_MS } from '@rca/core/constants'
import { MONTHLY_AFTER_DAYS, inGap } from '@rca/core/digest/trendSeries'
import type { QuietGap } from '@rca/core/digest/trendSeries'
import { formatDayMonth, formatMonth } from '../format/date'
import type { AxisTick, PlotBox } from './chartTypes'
import type { Scale } from './scale'
import { axisFontSize, fitTicks, labelWidth, rootScale } from './ticks'

/** Spans shorter than this many days label each sample's week; longer ones label month starts. */
const WEEKLY_LABEL_SPAN_DAYS = 92
/** A month start this close to the first or last sample is left out, so the two ends stay readable. */
const END_CLEARANCE_MS = 14 * DAY_MS

/**
 * The local-zone noon on the UTC calendar date of ms. A trend's weeks end on UTC Sundays, so naming
 * them through this names the same day in every zone.
 */
export const utcDayLocal = noonOnLabelDate

/** The UTC day of an instant and its month, such as "12 Jan". */
export function shortDate(ms: number): string {
  return `${new Date(ms).getUTCDate()} ${formatMonth(utcDayLocal(ms), false)}`
}

/** The UTC day, month and year of an instant, such as "12 Jan 2025". */
export function shortDateWithYear(ms: number): string {
  return `${shortDate(ms)} ${new Date(ms).getUTCFullYear()}`
}

/**
 * The viewer's own day, month and year of an activity's moment, such as "12 Jan 2025". An activity is dated by
 * the viewer's day everywhere else (its list, its badges), so a chart naming the day an effort was done uses this;
 * shortDate names the UTC day of a trend's week end. The day is the one calendar.ts cuts, and it is named from
 * that day's noon, so the name is the same whichever zone the device is in.
 */
export function activityDate(ms: number): string {
  const day = localDayOfInstant(ms)
  const noon = startOfDayNumber(day) + 12 * 3_600_000
  return `${formatDayMonth(noon, noon)} ${civilOfDay(day).year}`
}

/** The most month starts one axis lists: 500 years, far past any trend, so a bad bound cannot run the loop away. */
const MAX_MONTH_STARTS = 6000

/** First instants of the calendar months, in UTC, that fall after fromMs and up to toMs. */
export function monthStartsBetween(fromMs: number, toMs: number): number[] {
  const starts: number[] = []
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return starts
  const from = new Date(fromMs)
  for (let month = from.getUTCMonth() + 1; starts.length < MAX_MONTH_STARTS; month++) {
    const start = Date.UTC(from.getUTCFullYear(), month, 1)
    if (!(start <= toMs)) break
    starts.push(start)
  }
  return starts
}

/**
 * The date-axis ticks of a trend whose samples end at endsMs, in ascending order. A short span
 * labels every sample's week. A longer one labels the month starts between the first and last
 * samples, and always the first and last samples themselves. The month starts carry their year, so the
 * first sample, which has none before it to say which, carries its own: its day on a span of 26 weeks or
 * less, and its month past that, where the chart is drawn by the month.
 */
export function trendDateTicks(
  endsMs: readonly number[],
  x: Scale,
  gaps: readonly QuietGap[] = [],
): AxisTick[] {
  const first = endsMs[0]
  const last = endsMs.at(-1)
  if (first === undefined || last === undefined || endsMs.length < 2) return []
  if ((last - first) / DAY_MS < WEEKLY_LABEL_SPAN_DAYS) {
    return endsMs.map((ms) => ({ position: x(ms), label: shortDate(ms) }))
  }
  const months = monthStartsBetween(first, last)
    .filter((ms) => ms - first >= END_CLEARANCE_MS && last - ms >= END_CLEARANCE_MS)
    .filter((ms) => !inGap(gaps, ms))
    .map((ms) => ({ position: x(ms), label: formatMonth(utcDayLocal(ms), true) }))
  // Past 26 weeks the chart is drawn by the month, so its first tick is named by its month, as the others are.
  const firstLabel =
    (last - first) / DAY_MS > MONTHLY_AFTER_DAYS
      ? formatMonth(utcDayLocal(first), true)
      : shortDateWithYear(first)
  return [
    { position: x(first), label: firstLabel },
    ...months,
    { position: x(last), label: shortDate(last) },
  ]
}

/** The room kept between two tick labels, in px. */
const TICK_LABEL_GAP_PX = 8

/** The left and right edges of a tick's label as the axis sets it: centred, or against the plot's edge near either end. */
export function labelExtent(
  tick: AxisTick,
  plot: PlotBox,
  fontPx: number,
  scale: number,
): [left: number, right: number] {
  const width = labelWidth(tick.label, fontPx, scale)
  if (tick.position - width / 2 < plot.left) return [tick.position, tick.position + width]
  if (tick.position + width / 2 > plot.right) return [tick.position - width, tick.position]
  return [tick.position - width / 2, tick.position + width / 2]
}

/**
 * Drops ticks until no two labels meet, measuring each label where the axis sets it: the first starts at its
 * tick and the last ends at its, so two near one end can touch though their ticks are far enough apart for
 * centred labels. An interior tick goes before an end one, so the span's two ends stay named.
 */
function apart(ticks: AxisTick[], plot: PlotBox, fontPx: number): AxisTick[] {
  const scale = rootScale()
  let kept = ticks
  // Each pass drops a tick, so the loop ends at one; the bound is only a guard.
  for (let pass = 0; pass <= ticks.length; pass++) {
    const extents = kept.map((tick) => labelExtent(tick, plot, fontPx, scale))
    const meets = extents.findIndex(
      (extent, i) => i + 1 < extents.length && extent[1] + TICK_LABEL_GAP_PX > extents[i + 1]![0],
    )
    if (meets < 0) return kept
    // The later of the two goes, unless it is the last tick, which stays: then the earlier one goes.
    const drop = meets + 1 === kept.length - 1 && meets > 0 ? meets : meets + 1
    kept = kept.filter((_, i) => i !== drop)
  }
  return kept
}

/**
 * The date ticks of a trend's x axis at a chart size: the trend's date ticks, thinned to the width and then to
 * where no two labels meet as the axis draws them.
 */
export function trendXTicks(
  endsMs: readonly number[],
  x: Scale,
  size: { width: number; plot: PlotBox },
  gaps: readonly QuietGap[] = [],
): AxisTick[] {
  const dated = trendDateTicks(endsMs, x, gaps)
  const ends = new Set([dated[0], dated.at(-1)])
  // The first and last ticks name the span, so thinning keeps them; `apart` then clears what touches them.
  const fitted = fitTicks(dated, {
    axis: 'x',
    width: size.width,
    keep: (tick) => ends.has(tick),
  })
  return apart(fitted, size.plot, axisFontSize(size.width))
}

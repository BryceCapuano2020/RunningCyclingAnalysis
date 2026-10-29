import { DAY_MS } from '@rca/core/constants'
import { BREAK_AFTER_WEEKS } from '@rca/core/digest/trendSeries'
import type { QuietGap } from '@rca/core/digest/trendSeries'
import type { ChartTableData } from './chartTypes'
import { weekDay } from './trendText'
import type { Sport } from '@rca/core/types'
import { formatSpan } from '../format/date'
import { effortLabel } from '../records'
import { utcDayLocal } from './trendTicks'

/** The fewest empty weeks in a row that break the line, and are worth a note: two months. */
export const GAP_NOTE_MIN_WEEKS = BREAK_AFTER_WEEKS

/** The activities a sport's trend needs, as the noun after "No", and what it needs of them after their length. */
const GAP_NOUN: Record<Sport, string> = { run: 'runs', ride: 'rides' }
const GAP_NEEDS: Record<Sport, string> = { run: '', ride: ' with power' }

interface Gap {
  fromMs: number
  toMs: number
}

/**
 * The longest stretch with no activity inside the trend: weeks with no value between two weeks that have one,
 * at least GAP_NOTE_MIN_WEEKS of them. Each week's value looks back over `windowDays`, so a week with none
 * means nothing in that window: the stretch starts a window before its first empty week and ends with its last.
 */
export function longestGap(
  endsMs: readonly number[],
  hasValue: readonly boolean[],
  windowDays: number,
): Gap | null {
  const firstValue = hasValue.indexOf(true)
  const lastValue = hasValue.lastIndexOf(true)
  let best: { start: number; end: number } | null = null
  let start: number | null = null
  for (let i = firstValue + 1; i < lastValue; i++) {
    if (!hasValue[i]) {
      start ??= i
      continue
    }
    if (start !== null && (best === null || i - start > best.end - best.start + 1)) {
      best = { start, end: i - 1 }
    }
    start = null
  }
  if (best === null || best.end - best.start + 1 < GAP_NOTE_MIN_WEEKS) return null
  return {
    fromMs: endsMs[best.start]! - windowDays * DAY_MS,
    toMs: endsMs[best.end]!,
  }
}

/**
 * The note under a trend for its longest gap: "The line breaks from 3 Dec 2024 to 17 Aug 2025: no rides of
 * 20 min or longer with power in that time." It says what the gap is, a stretch where the line has no value,
 * since a card's best covers the whole period and can sit on a date outside it. A trend of one effort length
 * has a value only where an activity was that long, so the note names the length: a gap in the 60 min trend
 * is not a gap in training.
 */
export function gapNote(sport: Sport, gap: Gap, effortS: number): string {
  const span = formatSpan(utcDayLocal(gap.fromMs), utcDayLocal(gap.toMs)).replace(' – ', ' to ')
  return `The line breaks from ${span}: no ${GAP_NOUN[sport]} of ${effortLabel(effortS)} or longer${GAP_NEEDS[sport]} in that time.`
}

/** The dates a gap in the time axis skips, such as "3 Dec 2019 to 17 Aug 2025". */
export function gapSpanText(gap: QuietGap): string {
  return formatSpan(utcDayLocal(gap.fromMs), utcDayLocal(gap.toMs)).replace(' – ', ' to ')
}

/** What a gap is, by chart: a trend has no value in it, and the hours strip had no week of an hour of training. */
export type GapKind = 'value' | 'training'

const GAP_REASON: Record<GapKind, string> = {
  value: 'where there is nothing to show',
  training: 'where no week had an hour of training',
}

/** The note for the gaps the time axis skips: where they were, and that a break mark shows each. */
export function axisGapNote(gaps: readonly QuietGap[], kind: GapKind = 'value'): string | null {
  if (gaps.length === 0) return null
  const spans = gaps.map(gapSpanText).join(' and ')
  return `The axis skips ${spans}, ${GAP_REASON[kind]}; a break mark stands for each.`
}

/** The same said for the chart's description, so a reader of the figure alone has the skipped dates. */
export function axisGapDescription(gaps: readonly QuietGap[]): string {
  return gaps.length === 0 ? '' : ` The time axis skips ${gaps.map(gapSpanText).join(' and ')}.`
}

/** The skipped stretches as a small table for the text view of the chart, or none when there are none. */
export function axisGapTable(gaps: readonly QuietGap[]): ChartTableData | undefined {
  if (gaps.length === 0) return undefined
  return {
    caption: 'Stretches the time axis skips',
    columns: ['Skipped from', 'Skipped to'],
    rows: gaps.map((gap) => [weekDay(gap.fromMs), weekDay(gap.toMs)]),
  }
}

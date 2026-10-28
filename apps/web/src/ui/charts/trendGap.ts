import { DAY_MS } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import { formatSpan } from '../format/date'
import { effortLabel } from '../records'
import { utcDayLocal } from './trendTicks'

/** The fewest empty weeks in a row that are worth a note: two months. Shorter gaps are seen on the chart. */
export const GAP_NOTE_MIN_WEEKS = 8

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
 * The note under a trend for its longest gap: "No rides of 20 min or longer with power from 3 Dec 2024 to
 * 17 Aug 2025." A trend of one effort length has a value only where an activity was that long, so the note
 * names the length: a gap in the 60 min trend is not a gap in training.
 */
export function gapNote(sport: Sport, gap: Gap, effortS: number): string {
  const span = formatSpan(utcDayLocal(gap.fromMs), utcDayLocal(gap.toMs)).replace(' – ', ' to ')
  return `No ${GAP_NOUN[sport]} of ${effortLabel(effortS)} or longer${GAP_NEEDS[sport]} from ${span}.`
}

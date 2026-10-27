import { plural } from '../components/plural'
import { formatDay } from '../format/date'
import { utcDayLocal } from './trendTicks'

/** "2 weeks", or "30 days" for a window that is not a whole number of weeks. */
export function windowPhrase(days: number): string {
  return days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day')
}

/** The window as it opens a noun, such as "4-week" in "the 4-week window". */
export function windowCompound(days: number): string {
  return days % 7 === 0 ? `${days / 7}-week` : `${days}-day`
}

/**
 * The day a trend's week ends on, such as "Sun 12 Jan 2025". A week ends on a UTC Sunday, so the
 * day is named in every zone from its UTC date.
 */
export function weekDay(ms: number): string {
  return formatDay(utcDayLocal(ms))
}

/** How a trend's line is drawn, which the note or the caption under it says once. */
export const STEPPED_LINE_TEXT =
  'Each line steps from one Sunday to the next, and breaks where a week has no value.'

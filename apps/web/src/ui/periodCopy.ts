import type { Sport } from '@rca/core/types'
import { DAY_MS } from '@rca/core/constants'
import { plural } from './components/plural'
import { DEFAULT_PERIOD_DAYS, windowEnding } from '@rca/core/period'
import type { Period } from '@rca/core/period'
import { SIX_WEEKS_DAYS, lengthOf, periodDates } from './components/rangeOptions'
import type { Span } from './components/rangeOptions'
import { agoText } from './format/ago'
import { SPORT_NOUN, SPORT_PLURAL } from './sports'

/**
 * The clause that names a span's dates, "between 12 May and 3 Aug 2025", or "on 20 Oct 2026" for a span
 * of one day, or '' when the span has no dates to name. Every sentence that says what a period is
 * missing uses this one clause.
 */
export function betweenClause(span: Span | undefined): string {
  const dates = span === undefined ? '' : periodDates(span)
  if (dates === '') return ''
  return dates.includes(' – ') ? `between ${dates.replace(' – ', ' and ')}` : `on ${dates}`
}

/**
 * What an activity list says when its period and sport leave nothing: "No runs between 21 Apr and 1
 * Jun 2026.", over the window the list counts back over. With no window, the files have none.
 */
export function listEmptyText(sport: Sport | 'all', window: Span | null): string {
  const noun = sport === 'all' ? 'activities' : SPORT_PLURAL[sport]
  if (window === null) return `No ${noun} in your files.`
  return `No ${noun} ${betweenClause(window)}.`
}

/**
 * What a sport's page says when it has nothing in the period on screen. It names the period and the
 * count in All time, so the athlete knows the switch is one tap away. With no activities at all in
 * the sport, it says so and asks for files: to see its records, or on Balance, to compare it with the other sport.
 */
export function sportEmptyText(
  sport: Sport,
  period: Period,
  inLibrary: number,
  compareWith?: Sport,
): string {
  const noun = SPORT_PLURAL[sport]
  // On the balance page the other sport is on screen, so the ask is to compare with it.
  const purpose =
    compareWith === undefined
      ? 'see your records'
      : `compare them with your ${SPORT_NOUN[compareWith]}`
  if (inLibrary === 0) return `Your files have no ${noun} yet. Add ${noun} to ${purpose}.`
  const when = period.days === null ? '' : ` ${betweenClause(period)}`
  return `No ${noun}${when}. You have ${plural(inLibrary, sport)} in All time.`
}

/** A newest activity older than this, in days, is dated on the page, since a 6-week period would read as current. */
const STALE_DAYS = SIX_WEEKS_DAYS

/**
 * The line that says how old the library's newest activity is once it is more than six weeks old, so
 * a 6-week period is not read as current. Its date is the end of the caption above, so the line
 * gives only the age. Null while the newest activity is recent, or when there is none. The clock is
 * a parameter, so the line is tested at a fixed day.
 */
export function latestActivityText(newestMs: number | null, nowMs = Date.now()): string | null {
  if (newestMs === null) return null
  const days = Math.floor((nowMs - newestMs) / DAY_MS)
  if (days <= STALE_DAYS) return null
  return `Latest activity ${agoText(days)}`
}

/**
 * The mark of a best that is the best of the period, such as "Best in the last 12 months" or "Best
 * between 12 May and 3 Aug 2025", or "Best on 3 Aug 2025" for one day. Null for all time, whose bests are the all-time records.
 */
export function periodBestText(period: Period): string | null {
  const { choice } = period
  if (period.days === null || choice === 'all') return null
  if (typeof choice === 'object') {
    return period.days === 1 ? `Best on ${periodDates(period)}` : `Best ${betweenClause(period)}`
  }
  return `Best in the last ${lengthOf(choice === 'default' ? DEFAULT_PERIOD_DAYS : choice)}`
}

/**
 * What a strip or heading says the period was: "across all time", "in the last 6 weeks", or, once the newest
 * activity is more than six weeks old and "last" would read as now, the dates the period counted over,
 * "between 21 Apr and 1 Jun 2026". The clock is a parameter, so it is tested at a fixed day.
 */
export function periodClause(days: number | null, newestMs: number, nowMs = Date.now()): string {
  if (days === null) return 'across all time'
  if (latestActivityText(newestMs, nowMs) !== null)
    return betweenClause(windowEnding(newestMs, days))
  return `in the last ${lengthOf(days)}`
}

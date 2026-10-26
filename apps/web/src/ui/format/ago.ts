import { DAYS_PER_MONTH } from '@rca/core/constants'
import { plural } from '../components/plural'

/**
 * How long ago a day was, in words: "today", "1 day ago", "2 weeks ago", "5 months ago" or "2 years
 * ago". Days count up to 13, then whole weeks up to 59 days, then months up to 23 months, then years.
 * Each unit above a day is rounded to the nearest whole one. Every "ago" the app writes comes from
 * here, so a record's date and the latest activity never count the same day differently.
 */
export function agoText(days: number): string {
  if (days <= 0) return 'today'
  if (days < 14) return `${plural(days, 'day')} ago`
  if (days < 60) return `${plural(Math.round(days / 7), 'week')} ago`
  const months = Math.round(days / DAYS_PER_MONTH)
  if (months <= 23) return `${plural(months, 'month')} ago`
  return `${plural(Math.round(months / 12), 'year')} ago`
}

import { DAY_MS } from '@rca/core/constants'

/** A trend spanning more than this many days is drawn a point a month, not a point a week. */
export const MONTHLY_AFTER_DAYS = 400

/** Said under a trend drawn by the month, once, so the thinner line is not read as missing weeks. */
export const MONTHLY_NOTE = 'Past 13 months, each point is the last week of its month.'

/** The UTC month an instant falls in, as one number. */
function monthOf(ms: number): number {
  const date = new Date(ms)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

/**
 * The weeks a trend draws. Up to MONTHLY_AFTER_DAYS they are all of them. Past that, 260 weekly points
 * are a smear of dots, so each calendar month keeps the last of its weeks, and the first and the
 * last week stay as the line's two ends, so a chart sharing this one's time axis still lines up with it.
 * A week's value is the best of a window that ends then, so a month's last week is a true reading of it.
 */
export function thinToMonths<T extends { endMs: number }>(
  weeks: readonly T[],
): { weeks: readonly T[]; monthly: boolean } {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (first === undefined || last === undefined) return { weeks, monthly: false }
  if ((last.endMs - first.endMs) / DAY_MS <= MONTHLY_AFTER_DAYS) return { weeks, monthly: false }
  const kept = new Set<number>([0, weeks.length - 1])
  const lastOfMonth = new Map<number, number>()
  weeks.forEach((week, index) => lastOfMonth.set(monthOf(week.endMs), index))
  for (const index of lastOfMonth.values()) kept.add(index)
  return { weeks: [...kept].sort((a, b) => a - b).map((index) => weeks[index]!), monthly: true }
}

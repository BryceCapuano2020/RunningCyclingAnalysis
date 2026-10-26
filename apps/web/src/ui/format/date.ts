const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * A day in the viewer's local zone, such as "Tue 3 Jun", with the year added only when it is not
 * the year of nowMs. The names are spelt out, so the text does not depend on the browser locale.
 */
export function formatDay(ms: number, nowMs = Date.now()): string {
  const date = new Date(ms)
  const day = `${WEEKDAYS[date.getDay()]!} ${date.getDate()} ${MONTHS[date.getMonth()]!}`
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear()
  return sameYear ? day : `${day} ${date.getFullYear()}`
}

/**
 * A day for a row under its month heading, such as "Sat 14": the weekday and the day, with neither
 * the month nor the year, which the heading gives.
 */
export function formatRowDay(ms: number): string {
  const date = new Date(ms)
  return `${WEEKDAYS[date.getDay()]!} ${date.getDate()}`
}

/** A month in the viewer's local zone, such as "Mar", or "Mar 2023" when withYear is set. */
export function formatMonth(ms: number, withYear: boolean): string {
  const date = new Date(ms)
  const month = MONTHS[date.getMonth()]!
  return withYear ? `${month} ${date.getFullYear()}` : month
}

/** The local time of day in twelve-hour form, such as "6:42 am". Core's formatter, so there is one. */
export { formatTimeOfDay } from '@rca/core/units'

/**
 * A span of dates in the viewer's local zone, such as "12 May – 3 Aug 2025". The year is written
 * once, at the end, unless the span crosses a year end, when both ends carry one.
 */
export function formatSpan(startMs: number, endMs: number): string {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const from = `${start.getDate()} ${MONTHS[start.getMonth()]!}`
  const to = `${end.getDate()} ${MONTHS[end.getMonth()]!} ${end.getFullYear()}`
  return start.getFullYear() === end.getFullYear()
    ? `${from} – ${to}`
    : `${from} ${start.getFullYear()} – ${to}`
}

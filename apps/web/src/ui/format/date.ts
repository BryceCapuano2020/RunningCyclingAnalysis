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

/** A month in the viewer's local zone, such as "Mar", or "Mar 2023" when withYear is set. */
export function formatMonth(ms: number, withYear: boolean): string {
  const date = new Date(ms)
  const month = MONTHS[date.getMonth()]!
  return withYear ? `${month} ${date.getFullYear()}` : month
}

/** The local time of day in twelve-hour form, such as "6:42 am". */
export function formatTimeOfDay(ms: number): string {
  const date = new Date(ms)
  const hour = date.getHours()
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour12}:${minute} ${hour < 12 ? 'am' : 'pm'}`
}

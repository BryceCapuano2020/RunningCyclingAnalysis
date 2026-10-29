/** The weekday, day and month of a moment, named in the viewer's language by the browser. */
type DateName = 'weekday' | 'day' | 'month'

/** English names, used only when the browser gives none, so a date is still written. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * One formatter per field set and zone offset, so a list of dates builds each formatter once, not once
 * a row. A formatter keeps the zone it was built in; the offset at the moment shows a change of zone.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatterFor(fields: Intl.DateTimeFormatOptions, ms: number): Intl.DateTimeFormat {
  const key = `${new Date(ms).getTimezoneOffset()}|${JSON.stringify(fields)}`
  const cached = FORMATTERS.get(key)
  if (cached !== undefined) return cached
  const formatter = new Intl.DateTimeFormat(undefined, fields)
  FORMATTERS.set(key, formatter)
  return formatter
}

/** The English names of a moment, in the viewer's zone. */
function englishNames(ms: number): Record<DateName, string> {
  const date = new Date(ms)
  return {
    weekday: WEEKDAYS[date.getDay()] ?? '',
    day: String(date.getDate()),
    month: MONTHS[date.getMonth()] ?? '',
  }
}

/**
 * The parts of a date that the fields ask for, in the viewer's zone and language. The app writes
 * every date through this one helper, so the names follow the browser and the order stays the
 * app's own: weekday, then day, then month (DESIGN.md, "Tue 3 Jun"). A part the browser does not
 * give is taken from the English names.
 */
function namesOf(
  ms: number,
  fields: Intl.DateTimeFormatOptions,
): Partial<Record<DateName, string>> {
  const named: Partial<Record<DateName, string>> = {}
  for (const part of formatterFor(fields, ms).formatToParts(ms)) {
    if (part.type === 'weekday' || part.type === 'day' || part.type === 'month') {
      named[part.type] = part.value
    }
  }
  const english = englishNames(ms)
  for (const name of ['weekday', 'day', 'month'] as const) {
    if (fields[name] !== undefined && named[name] === undefined) named[name] = english[name]
  }
  return named
}

/** The weekday and day of a moment, such as "Tue 3". */
function weekdayAndDay(ms: number): string {
  const { weekday = '', day = '' } = namesOf(ms, { weekday: 'short', day: 'numeric' })
  return `${weekday} ${day}`
}

/** The year, added to a day's text only when the day is not in the year of nowMs. */
function withYearUnless(text: string, ms: number, nowMs: number): string {
  const year = new Date(ms).getFullYear()
  return year === new Date(nowMs).getFullYear() ? text : `${text} ${year}`
}

/**
 * A day in the viewer's local zone, such as "Tue 3 Jun", with the year added only when it is not
 * the year of nowMs.
 */
export function formatDay(ms: number, nowMs = Date.now()): string {
  const { month = '' } = namesOf(ms, { month: 'short' })
  return withYearUnless(`${weekdayAndDay(ms)} ${month}`, ms, nowMs)
}

/**
 * A day without its weekday, such as "3 Jun", with the year added only when it is not the year of
 * nowMs. A record's source is dated this way: the weekday adds nothing to a best effort.
 */
export function formatDayMonth(ms: number, nowMs = Date.now()): string {
  const { day = '', month = '' } = namesOf(ms, { day: 'numeric', month: 'short' })
  return withYearUnless(`${day} ${month}`, ms, nowMs)
}

/**
 * A day for a row under its month heading, such as "Sat 14": the weekday and the day, with neither
 * the month nor the year, which the heading gives.
 */
export function formatRowDay(ms: number): string {
  return weekdayAndDay(ms)
}

/** A month in the viewer's local zone, such as "Mar", or "Mar 2023" when withYear is set. */
export function formatMonth(ms: number, withYear: boolean): string {
  const { month = '' } = namesOf(ms, { month: 'short' })
  return withYear ? `${month} ${new Date(ms).getFullYear()}` : month
}

/** A month's full name in the viewer's local zone and language, such as "March", for a sentence. */
export function formatMonthName(ms: number): string {
  const { month = '' } = namesOf(ms, { month: 'long' })
  return month
}

/** The local time of day in twelve-hour form, such as "6:42 am". Core's formatter, so there is one. */
export { formatTimeOfDay } from '@rca/core/units'

/**
 * A span of dates in the viewer's local zone, such as "12 May – 3 Aug 2025". The year is written
 * once, at the end, unless the span crosses a year end, when both ends carry one. A span of one day
 * is written once, such as "14 Jun 2025".
 */
export function formatSpan(startMs: number, endMs: number): string {
  const dayAndMonth = (ms: number) => {
    const { day = '', month = '' } = namesOf(ms, { day: 'numeric', month: 'short' })
    return `${day} ${month}`
  }
  const start = new Date(startMs)
  const end = new Date(endMs)
  const from = dayAndMonth(startMs)
  const to = `${dayAndMonth(endMs)} ${end.getFullYear()}`
  if (start.getFullYear() !== end.getFullYear()) return `${from} ${start.getFullYear()} – ${to}`
  return from === dayAndMonth(endMs) ? to : `${from} – ${to}`
}

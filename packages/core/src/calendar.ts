import { DAY_MS } from './constants'
import type { LocalDayShift } from './types'

/**
 * The one module that does calendar arithmetic (D12 section 2.5). An activity's local day is its UTC day plus
 * the shift its file records (-1, 0 or +1, see import/localDay.ts); where a file records none, the viewer's
 * zone, given once at the edge, says. No UTC offset is kept.
 *
 * The days of a period, a custom range, a dated setting and an age are cut in the viewer's zone, given once
 * at the edge (`setViewerZone`), and `Date`'s own zone is not read: a figure is the same on every device. Until
 * the flag is set they are cut in the device's zone as they always were, and this is the one module that
 * reads it (calendar.guard.test.ts forbids every other).
 *
 * Weeks run Monday to Sunday. Until the release that writes revision 7 they are cut in UTC, as they always
 * were: `LOCAL_WEEKS` is false, every function here gives the UTC answer, and nothing in a digest or a figure
 * moves. That release sets it true together with the revision, so the figures are re-pinned once.
 */
export const LOCAL_WEEKS = false

export const WEEK_MS = 7 * DAY_MS

/** The day number of a Monday: 5 January 1970, from which weeks count, so they line up for every library. */
const MONDAY_DAY_NUMBER = 4

/** Minutes east of UTC at an instant. */
export type Zone = (ms: number) => number

/** The UTC zone, which the viewer's is until the edge sets it. */
export const UTC_ZONE: Zone = () => 0

/** Something with a start and, from revision 7, the shift its file recorded. */
export interface Dated {
  startMs: number
  localDayShift?: LocalDayShift
}

let localWeeks = LOCAL_WEEKS
let viewerZone: Zone = UTC_ZONE
/** Counts the zones the viewer has been given, so a result kept for one is not taken for another's. */
let zoneVersion = 0

/**
 * Runs `run` with local weeks on or off. For tests: the setting is put back when `run` returns, so a run that
 * returns a promise would continue under the real one and is refused.
 */
export function withLocalWeeks<T>(on: boolean, run: () => T): T {
  const before = localWeeks
  localWeeks = on
  try {
    const result = run()
    if (result instanceof Promise) {
      throw new TypeError('withLocalWeeks cannot hold the setting across an await')
    }
    return result
  } finally {
    localWeeks = before
  }
}

/** Whether weeks are cut in local days now. */
export function localWeeksOn(): boolean {
  return localWeeks
}

/** Sets the viewer's zone, once, at the edge that knows it (the worker). Returns the one it replaced. */
export function setViewerZone(zone: Zone): Zone {
  const before = viewerZone
  zoneVersion++
  viewerZone = zone
  return before
}

/** The day shift a zone gives an instant: its local date less its UTC date. */
export function shiftFromZone(zone: Zone, ms: number): LocalDayShift {
  const shift = Math.floor((ms + zone(ms) * 60_000) / DAY_MS) - Math.floor(ms / DAY_MS)
  return shift as LocalDayShift
}

/** The local day number of an activity: its UTC day plus its shift, or the zone's where it has none. */
export function localDayNumber(item: Dated, zone: Zone = viewerZone): number {
  return (
    Math.floor(item.startMs / DAY_MS) + (item.localDayShift ?? shiftFromZone(zone, item.startMs))
  )
}

/**
 * How many days later than its UTC day an activity falls, for the code that places activities on a continuous
 * clock of days (the fitness monitor): its shift, or the viewer's zone's where the file gave none. Zero while
 * local weeks are off.
 */
export function dayShiftFor(item: Dated): number {
  if (!localWeeks) return 0
  return item.localDayShift ?? shiftFromZone(viewerZone, item.startMs)
}

/** The Monday-start week a day number falls in, counted from 5 January 1970. */
export function weekOfDay(day: number): number {
  return Math.floor((day - MONDAY_DAY_NUMBER) / 7)
}

/** The Sunday 23:59:59.999 UTC that ends the Monday-to-Sunday week (in UTC) that holds ms. */
export function weekEndMs(ms: number): number {
  return (MONDAY_DAY_NUMBER + (weekOfDay(Math.floor(ms / DAY_MS)) + 1) * 7) * DAY_MS - 1
}

/**
 * The first and last week ends of a set of activities, or null for none. Activities are in order of start,
 * but a week is that of the local day, so the first by start is not always in the first week.
 */
export function weekEndsSpan(items: readonly Dated[]): { first: number; last: number } | null {
  let first = Infinity
  let last = -Infinity
  for (const item of items) {
    const end = weekEndFor(item)
    if (end < first) first = end
    if (end > last) last = end
  }
  return items.length === 0 ? null : { first, last }
}

/**
 * The end of the week an activity belongs to, as the instant that week's UTC Sunday ends. With local weeks off
 * that is the week of its UTC start. With them on it is the week of its local day, so a run that starts at
 * 00:30 Monday local time belongs to that Monday's week wherever the zone puts it against UTC.
 */
export function weekEndFor(item: Dated): number {
  if (!localWeeks) return weekEndMs(item.startMs)
  return (MONDAY_DAY_NUMBER + (weekOfDay(localDayNumber(item)) + 1) * 7) * DAY_MS - 1
}

// ---------------------------------------------------------------------------------------------------------
// Days of a period, a custom range, a dated setting and an age.

/** The device's zone at an instant: what `Date` has always used here. The only read of it. */
const deviceZone: Zone = (ms) => -new Date(ms).getTimezoneOffset()

/** The zone days are cut in: the viewer's with local weeks on, the device's before. */
function dayZone(): Zone {
  return localWeeks ? viewerZone : deviceZone
}

/** The number of the local calendar day that holds the instant, counted from 1 January 1970. */
export function localDayOfInstant(ms: number): number {
  return Math.floor((ms + dayZone()(ms) * 60_000) / DAY_MS)
}

/** The key of the zone days are cut in. A result grouped by local day is kept only for the zone it was made in. */
export function dayZoneKey(): string {
  return localWeeks ? `viewer:${zoneVersion}` : Intl.DateTimeFormat().resolvedOptions().timeZone
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** The local calendar date of an instant, as `YYYY-MM-DD`. */
export function localDateText(ms: number): string {
  const date = new Date(localDayOfInstant(ms) * DAY_MS)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** The local calendar year of an instant. */
export function localYearOf(ms: number): number {
  return new Date(localDayOfInstant(ms) * DAY_MS).getUTCFullYear()
}

/**
 * The instant the local time `localMs` (a wall clock read as if it were UTC) happens at in a zone. A zone whose
 * offset differs either side of a clock change is settled by taking the offset at the guess, twice.
 */
function instantOfLocal(localMs: number, zone: Zone): number {
  let at = localMs - zone(localMs) * 60_000
  at = localMs - zone(at) * 60_000
  return localMs - zone(at) * 60_000
}

/** The first millisecond of the local day that holds ms. */
export function startOfLocalDay(ms: number): number {
  if (!localWeeks) {
    const date = new Date(ms)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  return instantOfLocal(localDayOfInstant(ms) * DAY_MS, viewerZone)
}

/** The last millisecond of the local day that holds ms, so a period ends with its last day. */
export function endOfLocalDay(ms: number): number {
  if (!localWeeks) {
    const date = new Date(ms)
    date.setHours(23, 59, 59, 999)
    return date.getTime()
  }
  return instantOfLocal((localDayOfInstant(ms) + 1) * DAY_MS, viewerZone) - 1
}

/** The instant that falls the given number of local calendar days before ms, at the same time of day. */
export function daysBefore(ms: number, days: number): number {
  if (!localWeeks) {
    const date = new Date(ms)
    date.setDate(date.getDate() - days)
    return date.getTime()
  }
  return instantOfLocal(ms + viewerZone(ms) * 60_000 - days * DAY_MS, viewerZone)
}

/** The local calendar days from the day of startMs to the day of endMs, both counted. */
export function calendarDays(startMs: number, endMs: number): number {
  return Math.round((startOfLocalDay(endMs) - startOfLocalDay(startMs)) / DAY_MS) + 1
}

/** The local midnight that starts a real day, or null when the year, month and day name none (31 June). */
export function startOfRealDay(year: number, month: number, day: number): number | null {
  if (!localWeeks) {
    const date = new Date(year, month - 1, day)
    const real =
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    return real ? date.getTime() : null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? instantOfLocal(date.getTime(), viewerZone) : null
}

/** The local midnight that starts the day a `YYYY-MM-DD` names, without checking that it is a day. */
export function startOfDayText(text: string): number {
  const [year = 0, month = 1, day = 1] = text.split('-').map(Number)
  if (!localWeeks) {
    const start = new Date(0)
    start.setFullYear(year, month - 1, day)
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return instantOfLocal(date.getTime(), viewerZone)
}

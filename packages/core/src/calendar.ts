import { DAY_MS } from './constants'
import type { LocalDayShift } from './types'

/**
 * The one module that does calendar arithmetic (D12 section 2.5). An activity's local day is its UTC day plus
 * the shift its file records (-1, 0 or +1, see import/localDay.ts); where a file records none, the viewer's
 * zone, given once at the edge, says. No UTC offset is kept.
 *
 * The days of a period, a custom range, a dated setting and an age are cut in the viewer's zone, given once
 * at the edge (`setViewerZone`), and `Date`'s own zone is not read here: a figure is the same on every device
 * (calendar.guard.test.ts forbids every other module to read it).
 *
 * Weeks run Monday to Sunday and are cut in local days: an activity's day is its UTC day plus the shift its file
 * records, or the viewer's zone's where it records none. The weeks were cut in UTC until the release that wrote revision 7
 * (the figures were re-pinned once, with the digests); with no shift in a file and the viewer's zone UTC the two are the same.
 */

export const WEEK_MS = 7 * DAY_MS

/** The day number of a Monday: 5 January 1970, from which weeks count, so they line up for every library. */
const MONDAY_DAY_NUMBER = 4

/** The same Monday as an instant: weeks count from it. */
export const WEEK_ORIGIN_MS = MONDAY_DAY_NUMBER * DAY_MS

/** Minutes east of UTC at an instant. */
export type Zone = (ms: number) => number

/** The UTC zone, which the viewer's is until the edge sets it. */
export const UTC_ZONE: Zone = () => 0

/** Something with a start and, from revision 7, the shift its file recorded. */
export interface Dated {
  startMs: number
  localDayShift?: LocalDayShift
}

let viewerZone: Zone = UTC_ZONE
/** Counts every change of the viewer's zone, so a cache that read it can tell it is stale. */
let calendarVersion = 0

/**
 * What a remembered answer must also match: it changes whenever the viewer's zone does.
 * Memos keyed by digests alone would otherwise serve a week cut in one zone to a reader in another.
 */
export function calendarKey(): number {
  return calendarVersion
}

/** A function that is true once each time the calendar (the viewer's zone) has changed since it was last asked. */
export function calendarWatch(): () => boolean {
  let seen = calendarVersion
  return () => {
    const moved = seen !== calendarVersion
    seen = calendarVersion
    return moved
  }
}

/** Sets the viewer's zone, once, at the edge that knows it (the worker). Returns the one it replaced. */
export function setViewerZone(zone: Zone): Zone {
  const before = viewerZone
  viewerZone = zone
  calendarVersion++
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
 * clock of days (the fitness monitor): its shift, or the viewer's zone's where the file gave none.
 */
export function dayShiftFor(item: Dated): number {
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
 * The start of an activity on the axis the week ends are on. A week end is a Sunday 23:59:59.999 counted as if
 * the local day were the UTC one, so an instant (a start, a window's edge) cannot be compared with it: at UTC-7 a
 * run at 18:00 on Sunday starts after Monday 00:00 UTC. This puts the start on that axis, at its own time of day
 * on its local date, so `localAxisMs(a) <= end` is exactly `weekEndFor(a) <= end` for a week end, and a window
 * of whole days cut at week ends holds the same activities as the weeks it spans.
 */
export function localAxisMs(item: Dated, zone: Zone = viewerZone): number {
  return item.startMs + (localDayNumber(item, zone) - Math.floor(item.startMs / DAY_MS)) * DAY_MS
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
 * The end of the week an activity belongs to, as the instant that week's UTC Sunday ends: the week of its local
 * day, so a run that starts at 00:30 Monday local time belongs to that Monday's week wherever the zone puts it
 * against UTC.
 */
export function weekEndFor(item: Dated, zone: Zone = viewerZone): number {
  return (MONDAY_DAY_NUMBER + (weekOfDay(localDayNumber(item, zone)) + 1) * 7) * DAY_MS - 1
}

/**
 * The instant a week end is, in the viewer's zone: the last millisecond of that local Sunday. The week end itself
 * is a label on the week axis (see `localAxisMs`); this is the instant to hand to code that compares instants
 * (a start `<=` an as-of date).
 */
export function weekEndInstant(weekEnd: number, zone: Zone = viewerZone): number {
  const guess = weekEnd - zone(weekEnd) * 60_000
  return weekEnd - zone(guess) * 60_000
}

// ---------------------------------------------------------------------------------------------------------
// Days of a period, a custom range, a dated setting and an age.

/** The zone days are cut in: the viewer's, given once at the edge that knows it. */
function dayZone(): Zone {
  return viewerZone
}

/** The number of the local calendar day that holds the instant, counted from 1 January 1970. */
export function localDayOfInstant(ms: number): number {
  return Math.floor((ms + dayZone()(ms) * 60_000) / DAY_MS)
}

/** The key of the zone days are cut in. A result grouped by local day is kept only for the zone it was made in. */
export function dayZoneKey(): string {
  return `viewer:${calendarVersion}`
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
 * The local calendar day of an activity, counted from 1 January 1970: from the shift its file recorded, else the day
 * its start falls on in the viewer's zone.
 */
export function localDayOf(item: Dated): number {
  return localDayNumber(item)
}

/** The year, month (0 to 11) and day of the month a day number is. */
export function civilOfDay(day: number): { year: number; month: number; date: number } {
  const date = new Date(day * DAY_MS)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), date: date.getUTCDate() }
}

/** The day number of a year, month (0 to 11) and day of the month; a month or day out of range rolls over. */
export function dayOfCivil(year: number, month: number, date: number): number {
  const at = new Date(0)
  at.setUTCFullYear(year, month, date)
  return Math.floor(at.getTime() / DAY_MS)
}

/** The Monday on or before a day number: weeks start there. */
export function mondayOnOrBefore(day: number): number {
  return day - ((((day - MONDAY_DAY_NUMBER) % 7) + 7) % 7)
}

/**
 * Noon, in the zone days are cut in, on the date a label on the week axis reads (its UTC date). A week end is such a
 * label, and a chart names it by the date it reads, so the name is the same in every zone.
 */
export function noonOnLabelDate(label: number): number {
  return startOfDayNumber(Math.floor(label / DAY_MS)) + 12 * 3_600_000
}

/** The instant the local day numbered `day` starts. */
export function startOfDayNumber(day: number): number {
  return instantOfLocal(day * DAY_MS, viewerZone)
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
  return instantOfLocal(localDayOfInstant(ms) * DAY_MS, viewerZone)
}

/** The last millisecond of the local day that holds ms, so a period ends with its last day. */
export function endOfLocalDay(ms: number): number {
  return instantOfLocal((localDayOfInstant(ms) + 1) * DAY_MS, viewerZone) - 1
}

/** The instant that falls the given number of local calendar days before ms, at the same time of day. */
export function daysBefore(ms: number, days: number): number {
  return instantOfLocal(ms + viewerZone(ms) * 60_000 - days * DAY_MS, viewerZone)
}

/** The local calendar days from the day of startMs to the day of endMs, both counted. */
export function calendarDays(startMs: number, endMs: number): number {
  return Math.round((startOfLocalDay(endMs) - startOfLocalDay(startMs)) / DAY_MS) + 1
}

/** The local midnight that starts a real day, or null when the year, month and day name none (31 June). */
export function startOfRealDay(year: number, month: number, day: number): number | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? instantOfLocal(date.getTime(), viewerZone) : null
}

/** The local midnight that starts the day a `YYYY-MM-DD` names, without checking that it is a day. */
export function startOfDayText(text: string): number {
  const [year = 0, month = 1, day = 1] = text.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return instantOfLocal(date.getTime(), viewerZone)
}

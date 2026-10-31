import { DAY_MS } from './constants'
import type { LocalDayShift } from './types'

/**
 * The one module that does calendar arithmetic (D12 section 2.5). An activity's local day is its UTC day plus
 * the shift its file records (-1, 0 or +1, see import/localDay.ts); where a file records none, the viewer's
 * zone, given once at the edge, says. No UTC offset is kept and `Date`'s ambient zone is never read.
 *
 * Weeks run Monday to Sunday and are cut in local days: an activity's day is its UTC day plus the shift its file
 * records, or the viewer's zone's where it records none. The weeks were cut in UTC until the release that wrote revision 7
 * (the figures were re-pinned once, with the digests); with no shift in a file and the viewer's zone UTC the two are the same.
 */

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

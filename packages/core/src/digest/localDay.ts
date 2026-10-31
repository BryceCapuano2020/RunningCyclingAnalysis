import { DAY_MS } from '../constants'

/**
 * The local calendar day of an instant, as a number that is the same for every instant of one local day: the day count of
 * the instant moved by the zone's offset then. It groups by the same days as `localDateOf` without formatting a date,
 * which is the costly part of reading a library's days, and which the maximum heart rates and the zones do at every change of
 * the library or its settings.
 */
export function localDayNumber(ms: number): number {
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / DAY_MS)
}

/**
 * The time zone the local days are cut in. A result that groups by `localDayNumber` is kept only for the zone it was made in:
 * a process whose zone changes (a test that sets TZ) must not take an answer made for another one.
 */
export function localZoneKey(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * How a time with no zone designator is read. GPX says it is UTC. TCX requires a zone, so such a
 * time is refused rather than guessed.
 */
export type ZonelessPolicy = 'utc' | 'refuse'

/** The result of reading a time with the 'refuse' policy when the text has no zone. */
export const ZONELESS = 'zoneless'

const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/i

/**
 * Epoch milliseconds for an XML Schema dateTime, as GPX and TCX write trackpoint times. Date.parse
 * would read a zone-less time as local time, so the zone is applied here. Fractions of a second
 * are kept to the millisecond. Returns ZONELESS for a zone-less time when the policy refuses it,
 * and undefined for anything malformed.
 */
export function parseIsoTime(text: string, zoneless: 'utc'): number | undefined
export function parseIsoTime(text: string, zoneless: 'refuse'): number | typeof ZONELESS | undefined
export function parseIsoTime(
  text: string,
  zoneless: ZonelessPolicy,
): number | typeof ZONELESS | undefined {
  const match = ISO_TIME.exec(text.trim())
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined
  if (hour > 23 || minute > 59 || second > 60) return undefined

  const zone = match[8]
  if (zone === undefined && zoneless === 'refuse') return ZONELESS
  const offset = zoneOffsetMinutes(zone)
  if (offset === undefined) return undefined
  const fraction = match[7] === undefined ? 0 : Math.round(Number(match[7]) * 1000)
  // Date.UTC maps years 0-99 to 1900-1999, so the year is set separately.
  const date = new Date(Date.UTC(2000, month - 1, day, hour, minute, second))
  date.setUTCFullYear(year)
  const wall = date.getTime() + fraction
  return wall - offset * 60_000
}

/**
 * Seconds east of UTC for the zone designator of an XML Schema dateTime, or undefined when the text has
 * none, says `Z`, or is not a dateTime. `Z` says only that the time is UTC, not where the device was.
 */
export function isoZoneOffsetS(text: string): number | undefined {
  const zone = ISO_TIME.exec(text.trim())?.[8]
  if (zone === undefined || zone.toUpperCase() === 'Z') return undefined
  const minutes = zoneOffsetMinutes(zone)
  return minutes === undefined ? undefined : minutes * 60
}

/** Minutes east of UTC for a zone designator, 0 when there is none, undefined when malformed. */
function zoneOffsetMinutes(zone: string | undefined): number | undefined {
  if (zone === undefined || zone.toUpperCase() === 'Z') return 0
  const sign = zone[0] === '-' ? -1 : 1
  const hours = Number(zone.slice(1, 3))
  const minutes = Number(zone.slice(4, 6))
  if (hours > 23 || minutes > 59) return undefined
  return sign * (hours * 60 + minutes)
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

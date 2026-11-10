import type { Zone } from '@rca/core/calendar'

const QUARTER_HOUR_MS = 15 * 60_000

/**
 * The zone an IANA name gives, as minutes east of UTC at an instant: the browser's `Date` offset for the same name,
 * so a day is cut at the same place on the server as on the athlete's device. Offsets change on quarter hours, so the
 * answer is remembered for each, which keeps a library of thousands to a few hundred lookups.
 */
export function zoneNamed(name: string): Zone {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: name,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  const seen = new Map<number, number>()
  const offsetAt = (ms: number): number => {
    const parts: Record<string, number> = {}
    for (const part of format.formatToParts(ms)) {
      if (part.type !== 'literal') parts[part.type] = Number(part.value)
    }
    const local = Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    )
    return Math.round((local - Math.floor(ms / 1000) * 1000) / 60_000)
  }
  return (ms) => {
    const bucket = Math.floor(ms / QUARTER_HOUR_MS)
    let offset = seen.get(bucket)
    if (offset === undefined) {
      offset = offsetAt(bucket * QUARTER_HOUR_MS)
      seen.set(bucket, offset)
    }
    return offset
  }
}

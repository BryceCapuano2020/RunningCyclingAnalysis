import { isLiftDate } from '../key'

/** Date and time as a set holds them: local, YYYY-MM-DD and HH:MM. */
export interface HevyTime {
  date: string
  time?: string
}

const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')

// ISO date, then optionally a time after "T" or a space, seconds, a fraction and a zone.
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?$/
// "2 Mar 2026, 18:30": day, three-letter month, year, optional ", HH:mm".
const WRITTEN = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})(?:,? (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

function pad(n: string): string {
  return n.padStart(2, '0')
}

function monthNumber(name: string): number | null {
  const i = MONTHS.indexOf(name.toLowerCase())
  return i < 0 ? null : i + 1
}

function clock(h: string | undefined, m: string | undefined, s: string | undefined): string | null {
  if (h === undefined || m === undefined) return ''
  if (Number(h) > 23 || Number(m) > 59 || (s !== undefined && Number(s) > 59)) return null
  return `${pad(h)}:${m}`
}

/**
 * Reads a Hevy date cell: ISO ("2026-03-02", "2026-03-02 18:30:00", "2026-03-02T18:30:00") or the
 * written form ("2 Mar 2026, 18:30"). The digits are taken as written. A zone (Z or an offset) is refused: whether the export holds
 * wall-clock or UTC time is not known until a real header pins it. Anything else, a
 * date that does not exist or a time past 23:59, is null.
 */
export function parseHevyTime(text: string): HevyTime | null {
  const value = text.trim()
  let date: string
  let time: string | null
  const iso = ISO.exec(value)
  if (iso !== null) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`
    time = clock(iso[4], iso[5], iso[6])
  } else {
    const written = WRITTEN.exec(value)
    if (written === null) return null
    const month = monthNumber(written[2] as string)
    if (month === null) return null
    date = `${written[3]}-${pad(String(month))}-${pad(written[1] as string)}`
    time = clock(written[4], written[5], written[6])
  }
  if (time === null || !isLiftDate(date)) return null
  return time === '' ? { date } : { date, time }
}

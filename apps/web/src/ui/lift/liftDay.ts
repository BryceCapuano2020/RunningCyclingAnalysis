import { hashQuery } from '../route'

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** The year, month (1 to 12) and date of a real calendar day, or null for text that is not one ("2026-02-31"). */
function partsOf(day: string): [number, number, number] | null {
  const match = DAY.exec(day)
  if (match === null) return null
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  // Date.UTC rolls 2026-02-31 into March, so a day is real only when it reads back the same.
  const at = new Date(Date.UTC(year, month - 1, date))
  const real =
    at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === date
  return real ? [year, month, date] : null
}

/** Whether the text is a real YYYY-MM-DD day. */
export function isDay(day: string): boolean {
  return partsOf(day) !== null
}

/**
 * The day a number of days from this one (negative for earlier). It steps the parsed parts in UTC, where a day is
 * always a day, so a clock change cannot move it; never `new Date('YYYY-MM-DD')` or a fixed 86,400,000 ms.
 */
export function shiftDay(day: string, days: number): string {
  const parts = partsOf(day)
  if (parts === null) return day
  const at = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days))
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  const date = String(at.getUTCDate()).padStart(2, '0')
  return `${String(at.getUTCFullYear()).padStart(4, '0')}-${month}-${date}`
}

/** Local noon of a day in ms, which the date formatters read in the viewer's zone; noon keeps a clock change off its date. */
export function dayNoonMs(day: string): number | null {
  const parts = partsOf(day)
  return parts === null ? null : new Date(parts[0], parts[1] - 1, parts[2], 12).getTime()
}

/** The day '#/lift?day=YYYY-MM-DD' names; no day, an invalid one or one after today is today. */
export function liftDayOf(hash: string, today: string): string {
  const day = hashQuery(hash).get('day')
  // Days are fixed-width, so text order is date order.
  return day !== null && isDay(day) && day <= today ? day : today
}

/** The address of a lifting day: today's is the page's own, '#/lift'. */
export function liftHashOf(day: string, today: string): string {
  return day === today ? '#/lift' : `#/lift?day=${day}`
}

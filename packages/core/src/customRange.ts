/**
 * A period the athlete names by its first and last local calendar day, both inclusive. Each day is
 * `YYYY-MM-DD` in the device's zone, so a stored range reads the same on the next visit.
 */
export interface CustomRange {
  from: string
  to: string
}

const DAY_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/

/** The local midnight that starts the day a `YYYY-MM-DD` names, or null when it names no real day. */
export function dayStartMs(day: string): number | null {
  const match = DAY_FORMAT.exec(day)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const dayOfMonth = Number(match[3])
  const date = new Date(year, month - 1, dayOfMonth)
  // A day that rolls over, such as 31 June, is not a day.
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === dayOfMonth
  return real ? date.getTime() : null
}

/** The `YYYY-MM-DD` of the local calendar day that holds ms. */
export function dayOf(ms: number): string {
  const date = new Date(ms)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whether a value is a custom range: two real days, in either order. The one validator for the choice. */
export function isCustomChoice(value: unknown): value is CustomRange {
  if (typeof value !== 'object' || value === null) return false
  const { from, to } = value as Partial<CustomRange>
  return (
    typeof from === 'string' &&
    typeof to === 'string' &&
    dayStartMs(from) !== null &&
    dayStartMs(to) !== null
  )
}

/** The range with its days in order: one whose `to` is before its `from` is swapped. */
export function orderedRange({ from, to }: CustomRange): CustomRange {
  return to < from ? { from: to, to: from } : { from, to }
}

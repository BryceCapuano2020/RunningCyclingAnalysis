/**
 * One sport's week as three characters, so twelve years of weeks stay a few kilobytes of JSON: the hours in tenths
 * (12 bits, up to 409.5) and the activities (6 bits, up to 63), 18 bits in three of the 64 URL-safe characters.
 * A cell of no training is "AAA".
 */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const CELL_CHARS = 3
const COUNT_BITS = 6
const BASE = 64

export const MAX_CELL_TENTHS = 4095
export const MAX_CELL_ACTIVITIES = 63

/** What a week of one sport holds. */
export interface WeekCell {
  hours: number
  activities: number
}

/**
 * The cell for a week. A week with an activity keeps at least a tenth of an hour, so a short one is not
 * mistaken for a week of rest; hours and counts past the ends are held at them.
 */
export function packCell(hours: number, activities: number): string {
  const count = Math.min(MAX_CELL_ACTIVITIES, Math.max(0, activities))
  const rounded = Math.round(Math.max(0, hours) * 10)
  const tenths = Math.min(MAX_CELL_TENTHS, activities > 0 ? Math.max(1, rounded) : 0)
  let value = (tenths << COUNT_BITS) | count
  let text = ''
  for (let i = 0; i < CELL_CHARS; i++) {
    text = DIGITS.charAt(value % BASE) + text
    value = Math.floor(value / BASE)
  }
  return text
}

/** The week at `index` of a run of cells (zeros where the run is shorter, or a character is not one). */
export function cellAt(cells: string, index: number): WeekCell {
  let value = 0
  for (let i = 0; i < CELL_CHARS; i++) {
    value = value * BASE + Math.max(0, DIGITS.indexOf(cells.charAt(index * CELL_CHARS + i)))
  }
  return { hours: (value >> COUNT_BITS) / 10, activities: value & MAX_CELL_ACTIVITIES }
}

/** How many weeks a run of cells holds. */
export const cellCount = (cells: string): number => Math.floor(cells.length / CELL_CHARS)

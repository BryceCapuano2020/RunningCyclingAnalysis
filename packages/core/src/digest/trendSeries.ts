/** A trend spanning more than this many days is read by the month, not by the week: 26 weeks. */
export const MONTHLY_AFTER_DAYS = 26 * 7

/**
 * The most weeks in a row with no value that a line still runs through. Each week's value is the best of
 * a trailing window, so a week with none means no qualifying effort in that window, and `k` empty weeks
 * in a row between two valued ones mean more than `k` weeks with none. Eight weeks without an effort is
 * the longest stretch bridged; a longer one is a break.
 */
export const BREAK_AFTER_WEEKS = 8

/** The UTC month an instant falls in, as one number. */
function monthOf(ms: number): number {
  const date = new Date(ms)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

/** The most weeks a chart draws as weeks: 26. A longer one is drawn by the month. */
export const MONTHLY_AFTER_WEEKS = MONTHLY_AFTER_DAYS / 7

/**
 * Whether a series of weekly points is drawn by the month: when more than MONTHLY_AFTER_WEEKS weeks are drawn. It
 * counts the weeks drawn, not the time between the first and the last, so a year skipped between two stretches
 * does not make a short series monthly.
 */
export function isMonthly(weeklyEndsMs: readonly number[]): boolean {
  return weeklyEndsMs.length - 1 > MONTHLY_AFTER_WEEKS
}

/**
 * The indices of the weeks in each calendar month, by the UTC month the week ends in, in order. Every
 * week is in exactly one group, and a month with no week has no group.
 */
export function monthGroups(endsMs: readonly number[]): number[][] {
  const groups: number[][] = []
  let current = Number.NaN
  endsMs.forEach((ms, index) => {
    const month = monthOf(ms)
    if (month !== current) {
      groups.push([])
      current = month
    }
    groups[groups.length - 1]!.push(index)
  })
  return groups
}

/** One drawn row of a trend, and the indices of the weeks it stands for. */
export interface ThinnedRow<T> {
  row: T
  /** The weeks the row covers, as indices into the weekly series. One for a weekly row. */
  weeks: number[]
}

/**
 * The rows a trend draws. A span of MONTHLY_AFTER_DAYS or less keeps every week. A longer one keeps a
 * row a month: the mean, over the weeks of the month that have a value, of each field in `means`
 * (a field with no value in any of them stays null), the rest taken from the month's last week, dated at
 * that week. The final row is not averaged: it is the final week itself, so the latest reading is never averaged away,
 * and a field the final week has no value for is null there, since a value from an earlier week of the month would be
 * drawn as current.
 * `monthly` says which was done.
 */
export function thinTrend<T extends { endMs: number }>(
  weeks: readonly T[],
  means: readonly (keyof T)[],
): { rows: ThinnedRow<T>[]; monthly: boolean } {
  if (!isMonthly(weeks.map((week) => week.endMs))) {
    return { rows: weeks.map((row, index) => ({ row, weeks: [index] })), monthly: false }
  }
  const groups = monthGroups(weeks.map((week) => week.endMs))
  const rows = groups.map((indices, g) => {
    const lastIndex = indices.at(-1)!
    const lastWeek = weeks[lastIndex]!
    // The final row is the final week itself: a field it lacks is null there, so a line that ended earlier ends at its
    // own last month and is not drawn up to today.
    if (g === groups.length - 1) return { row: lastWeek, weeks: indices }
    const row = { ...lastWeek }
    for (const key of means) {
      const values = indices
        .map((index) => weeks[index]![key])
        .filter((value): value is T[keyof T] & number => typeof value === 'number')
      row[key] = (
        values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length
      ) as T[keyof T]
    }
    return { row, weeks: indices }
  })
  return { rows, monthly: true }
}

/**
 * Which valued weeks start a new stretch of line rather than continue the last one: a week with a value,
 * after a valued week, with at least BREAK_AFTER_WEEKS weeks without a value between them. The first
 * valued week starts the line and is not a break; a week with no value is never one.
 */
export function lineBreaks(hasValue: readonly boolean[]): boolean[] {
  let lastValued = -1
  return hasValue.map((valued, index) => {
    if (!valued) return false
    const isBreak = lastValued >= 0 && index - lastValued - 1 >= BREAK_AFTER_WEEKS
    lastValued = index
    return isBreak
  })
}

/**
 * The weekly breaks as the rows of a thinned trend carry them: a row breaks when any week it stands for
 * does, so a gap that no month shows through still breaks the line.
 */
export function rowBreaks<T>(rows: readonly ThinnedRow<T>[], weeklyBreaks: readonly boolean[]) {
  return rows.map(({ weeks }) => weeks.some((index) => weeklyBreaks[index] === true))
}

/** The fewest weeks in a row with nothing in them that a chart's time axis skips: a year. */
export const COMPRESS_AFTER_WEEKS = 52

/** A stretch of the time axis with nothing in it, from the end of the last week before it to the end of the first after. */
export interface QuietGap {
  fromMs: number
  toMs: number
}

/**
 * The span a chart's time axis covers, and the stretches inside it that the axis skips. It starts at the end
 * of the first active week and stops at the end of the last, so a library's quiet beginning or end is not drawn,
 * and a stretch of COMPRESS_AFTER_WEEKS or more inactive weeks between two active ones is a gap, which the axis
 * gives a small fixed width and marks.
 */
export interface TimeAxis {
  startMs: number
  endMs: number
  gaps: QuietGap[]
}

/**
 * The time axis of weeks that end at endsMs, `active` saying which of them hold anything to draw. Null when
 * none does. Two charts that share an axis pass the weeks active in either, so both skip the same stretches.
 */
export function timeAxisOf(endsMs: readonly number[], active: readonly boolean[]): TimeAxis | null {
  const first = active.indexOf(true)
  const last = active.lastIndexOf(true)
  if (first < 0) return null
  const gaps: QuietGap[] = []
  let before = first
  for (let i = first + 1; i <= last; i++) {
    if (!active[i]) continue
    if (i - before - 1 >= COMPRESS_AFTER_WEEKS) {
      gaps.push({ fromMs: endsMs[before]!, toMs: endsMs[i]! })
    }
    before = i
  }
  return { startMs: endsMs[first]!, endMs: endsMs[last]!, gaps }
}

/** Whether an instant lies strictly inside a gap, where the axis draws nothing. */
export function inGap(gaps: readonly QuietGap[], ms: number): boolean {
  return gaps.some((gap) => ms > gap.fromMs && ms < gap.toMs)
}

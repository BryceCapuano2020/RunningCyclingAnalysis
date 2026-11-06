import { civilOfDay, localDayOfInstant } from '../calendar'
import type { HistoryInput, HistoryPart } from './types'

/** The year the clock is in, which Hours per year reads to call the year still going "so far". */
export interface YearToDate {
  today: { year: number }
}

/** The answer for a library with nothing in it. */
const EMPTY: YearToDate = { today: { year: 0 } }

function build(digests: unknown[], input: HistoryInput): YearToDate {
  if (digests.length === 0) return EMPTY
  return { today: { year: civilOfDay(localDayOfInstant(input.nowMs)).year } }
}

/** Today's day is all this part reads of the input, so a remembered answer holds for the whole day. */
const sameDay = (a: HistoryInput, b: HistoryInput): boolean =>
  localDayOfInstant(a.nowMs) === localDayOfInstant(b.nowMs)

export const yearToDate: HistoryPart<YearToDate> = {
  empty: EMPTY,
  build,
  same: sameDay,
}

import { localDayOf, weekOfDay } from '../calendar'
import { SPORTS } from '../types'
import type { ActivityDigest, Sport } from '../types'
import { activityHours } from './hours'
import { isoWeekOf } from './isoWeeks'
import type { IsoWeek } from './isoWeeks'
import { perSport } from './sports'
import { readsDigestsOnly } from './types'
import type { HistoryPart } from './types'
import { cellAt, cellCount, packCell } from './weekCells'
import type { WeekCell } from './weekCells'

/**
 * The library's weeks, Monday to Sunday in the athlete's days, from the first week with an activity to the last: a
 * week with none is a cell of zeros, so a gap is in the run. Small by design (a few kilobytes for twelve years):
 * `trainingWeeks` reads it back as a list of weeks.
 */
export interface TrainingCalendar {
  /** The first week's number, as `weekOfDay` counts them. */
  firstWeek: number
  /** For each sport, one cell for every week from firstWeek (see weekCells.ts), none for a library without activities. */
  cells: Record<Sport, string>
}

/** One week of the library: where it sits in the calendar, and what each sport did in it. */
export interface TrainingWeek extends IsoWeek {
  /** The week's number, as `weekOfDay` counts them. */
  week: number
  sports: Record<Sport, WeekCell>
}

const NO_WEEK = packCell(0, 0)

const empty: TrainingCalendar = { firstWeek: 0, cells: perSport(() => '') }

/** Every week from the first to the last with an activity, per sport: hours (moving time, else elapsed) and count. */
function build(digests: ActivityDigest[]): TrainingCalendar {
  const byWeek = new Map<number, Record<Sport, WeekCell>>()
  let first = Infinity
  let last = -Infinity
  for (const digest of digests) {
    if (!SPORTS.includes(digest.sport)) continue
    const week = weekOfDay(localDayOf(digest))
    if (!Number.isInteger(week)) continue
    first = Math.min(first, week)
    last = Math.max(last, week)
    const totals = byWeek.get(week) ?? perSport(() => ({ hours: 0, activities: 0 }))
    byWeek.set(week, totals)
    totals[digest.sport].hours += activityHours(digest)
    totals[digest.sport].activities += 1
  }
  if (byWeek.size === 0) return empty
  const cells = perSport((): string[] => [])
  for (let week = first; week <= last; week++) {
    const totals = byWeek.get(week)
    for (const sport of SPORTS) {
      const { hours, activities } = totals?.[sport] ?? { hours: 0, activities: 0 }
      cells[sport].push(totals === undefined ? NO_WEEK : packCell(hours, activities))
    }
  }
  return { firstWeek: first, cells: perSport((sport) => cells[sport].join('')) }
}

export const calendar: HistoryPart<TrainingCalendar> = { empty, build, same: readsDigestsOnly }

/** The weeks of a calendar in order, each with its ISO year, number and month, and what each sport did. No weeks for an empty one. */
export function trainingWeeks({ firstWeek, cells }: TrainingCalendar): TrainingWeek[] {
  const count = Math.max(...SPORTS.map((sport) => cellCount(cells[sport])))
  return Array.from({ length: count }, (_, i) => ({
    week: firstWeek + i,
    ...isoWeekOf(firstWeek + i),
    sports: perSport((sport) => cellAt(cells[sport], i)),
  }))
}

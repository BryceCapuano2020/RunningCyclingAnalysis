import { DAY_MS } from '../constants'
import { civilOfDay, dayOfCivil, WEEK_ORIGIN_MS } from '../calendar'

/** The day number of the Monday that starts week 0 of `weekOfDay`: 5 January 1970. */
const ORIGIN_DAY = WEEK_ORIGIN_MS / DAY_MS
const THURSDAY = 3

/** Where a Monday-to-Sunday week sits in the calendar: by its Thursday, which is the ISO 8601 rule. */
export interface IsoWeek {
  /** The year of the week's Thursday, so a week that spans New Year belongs to the year most of it is in. */
  year: number
  /** 1 to 53: the week of the year. */
  number: number
  /** The month (0 to 11) of the week's Thursday. */
  month: number
  /** The day number of the week's Monday, counted from 1 January 1970. */
  mondayDay: number
}

/** The ISO week of a `weekOfDay` number (the calendar's Monday-start week, counted from 5 January 1970). */
export function isoWeekOf(week: number): IsoWeek {
  const mondayDay = ORIGIN_DAY + week * 7
  const thursday = mondayDay + THURSDAY
  const { year, month } = civilOfDay(thursday)
  const dayOfYear = thursday - dayOfCivil(year, 0, 1) + 1
  return { year, number: Math.floor((dayOfYear - 1) / 7) + 1, month, mondayDay }
}

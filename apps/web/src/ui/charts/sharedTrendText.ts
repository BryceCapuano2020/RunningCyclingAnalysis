import { levelOf } from '@rca/core/grade'
import { formatGrade } from '../gradeFormat'
import { WEIGHT_PROMPT_PARTS } from '../weightCopy'
import type { SharedWeek } from './gradeTrend'
import { weekDay } from './trendText'
import { formatDayMonth } from '../format/date'
import { SPORT_PLURAL } from '../sports'
import type { Sport } from '@rca/core/types'
import { DAY_MS } from '@rca/core/constants'
import { BREAK_AFTER_WEEKS } from '@rca/core/digest/trendSeries'

/** The level a grade falls in, which the tooltip names. */
export function levelNote(value: number): string | undefined {
  const level = levelOf(value)
  return level === null ? undefined : level
}

/**
 * The empty message of a trend that holds cycling for want of a weight, when only a ride has a value. It
 * says why the chart is empty, and the note under it says the rest.
 */
export const HELD_EMPTY = `Your rides are held until you add a weight on ${WEIGHT_PROMPT_PARTS.page}.`

/** The sentence that says cycling is held, which a trend's note ends with, or which stands alone when nothing is drawn. */
export const HELD_NOTE = 'Cycling is held until a weight is added.'

/** A point is the best of its weeks, not an average, so a low point means even that best effort was easy. */
const LOW_POINT = 'A low point means even the best effort in those weeks was easy.'
/** Says the trend's "now" is its last window, so it is not read as the best of the period a card shows. */
const latestWindowNote = (windowText: string) =>
  `The latest point covers only the last ${windowText}, so it can differ from a card’s best over the period.`
/** What an age-graded ride is, said once in a chart's notes: the ring is the estimate and the band its range. */
const ESTIMATE_NOTE =
  'A ride is graded through its running equivalent, so it is an estimate: the ring is the estimate and the shaded band is its 90% range.'

/**
 * The notes a trend keeps behind "About this chart", in the order they are read: how the latest point differs from a
 * card, what a low point is, and for an age grade what the ride's ring and band are. The notes about breaks, months
 * and skipped years follow, as the chart has them.
 */
export function trendNotes(windowText: string): string[] {
  return [latestWindowNote(windowText), LOW_POINT, ESTIMATE_NOTE]
}

/** How the line is drawn, which the table's caption says once. */
const SMOOTHED = `The line is smoothed between weeks and breaks where ${BREAK_AFTER_WEEKS} weeks or more passed with no qualifying effort.`

/** Said under a chart whose line has a break, so a gap is read as a gap in the athlete's efforts and not a gap in the chart. */
export const BREAK_NOTE = `A line breaks where ${BREAK_AFTER_WEEKS} weeks or more passed with no qualifying effort.`

/** Said once in a table's caption when its rows are months, so a row is not read as one week's value or count. */
export const MONTHLY_ROWS = ' Monthly rows are averages of their weeks’ values.'

/** Said under a trend drawn by the month, once, so the thinner line is not read as missing weeks. */
export const MONTHLY_NOTE =
  'Past 26 weeks each point is a month: the average of its weekly values, and the last point is the latest week.'

/**
 * The dated note for a sport whose line stops before the window does, such as "No runs since 20 Jan": the
 * day of its latest activity of any length, when that is before the last week. Null while its line reaches
 * the last week, when it has no value at all, or when its latest activity is in the last week.
 */
export function endedNote(
  weeks: readonly SharedWeek[],
  sport: Sport,
  latestMs: number | null,
): string | null {
  const last = weeks.findLastIndex((week) => week[sport] !== null)
  const end = weeks[weeks.length - 1]?.endMs
  if (last < 0 || last === weeks.length - 1 || latestMs === null || end === undefined) return null
  // An activity in the last week would show on the line unless it is short, so there is no gap to date.
  if (latestMs >= end - 7 * DAY_MS) return null
  return `No ${SPORT_PLURAL[sport]} since ${formatDayMonth(latestMs)}.`
}

/** The dated note for each line that stops before the window does, in the order of the sports. */
export function endedNotes(
  weeks: readonly SharedWeek[],
  latestStartMs: Record<Sport, number | null>,
): string[] {
  return (['run', 'ride'] as const).flatMap((sport) => {
    const note = endedNote(weeks, sport, latestStartMs[sport])
    return note === null ? [] : [note]
  })
}

/** The words of the trend: its name, its axis, its key, its table and its empty state. */
export function copyOf(effort: string, windowText: string) {
  return {
    title: `Age grade of your best ${effort}, trailing ${windowText}`,
    description: `Run and ride age grades for the best ${effort} in each trailing ${windowText}, on one scale. Run is as recorded, with solid dots. Ride is estimated through its running equivalent, with hollow rings and a band for its 90% range.`,
    what: `Each point is your best ${effort} of the ${windowText} to that Sunday; rides are estimated.`,
    caption: `Each grade is the best ${effort} in the ${windowText} that end that week, at the age on the day of that effort. Ride grades are estimates, with their range. ${SMOOTHED}`,
    axisTitle: 'Age grade',
    empty: 'Add runs or rides in more than one week to see your age grades',
    runHeading: 'Run grade',
    rideHeading: 'Ride grade, estimated',
    runLegend: 'Run, as recorded',
    rideLegend: 'Ride, estimated',
  }
}

/** Grades are drawn in per cent, so the axis reads in whole steps. */
export function plotted(value: number): number {
  return value * 100
}

/** A grade in words, for a tooltip, a note, a table cell or an end label. */
export function formatValue(value: number): string {
  return formatGrade(value)
}

/** A week with cycling held back: its run kept, and no ride value, range or count. */
export function withRideHeld(week: SharedWeek): SharedWeek {
  return {
    endMs: week.endMs,
    run: week.run,
    ride: null,
    rideLow: null,
    rideHigh: null,
    runCount: week.runCount,
    rideCount: 0,
  }
}

/**
 * The one line that stands in for a trend with a single week of values: what that week holds, and why
 * no line is drawn. A trend needs a second week before it can show a change.
 */
export function singleValueText(week: SharedWeek, rideKnown: boolean): string {
  const parts = [
    week.run === null ? null : `Run ${formatValue(week.run)}`,
    rideKnown && week.ride !== null ? `Ride ${formatValue(week.ride)}` : null,
  ].flatMap((part) => (part === null ? [] : [part]))
  return `Only one week has a value: ${parts.join(' and ')}, week ending ${weekDay(week.endMs)}. A trend needs two weeks with values.`
}

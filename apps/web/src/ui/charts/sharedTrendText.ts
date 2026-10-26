import { levelOf } from '@rca/core/grade'
import { formatWkg } from '@rca/core/units'
import { formatGrade } from '../gradeFormat'
import type { SharedWeek } from './gradeTrend'
import { weekDay } from './trendText'

/** Which measure a shared trend shows: each sport's age grade, or its energy rate in W/kg. */
export type SharedMeasure = 'grade' | 'energy'

/** The level a grade falls in, which the tooltip names, or nothing for an energy value. */
export function levelNote(measure: SharedMeasure, value: number): string | undefined {
  if (measure === 'energy') return undefined
  const level = levelOf(value)
  return level === null ? undefined : level
}

/**
 * A cycling grade is an estimate through its running equivalent, and names its level. An energy
 * rate is drawn as measured, so it has no note.
 */
export function rideNote(measure: SharedMeasure, value: number): string | undefined {
  if (measure === 'energy') return undefined
  const level = levelOf(value)
  return level === null
    ? 'Estimated from its running equivalent'
    : `${level}, estimated from its running equivalent`
}

/** The words of each measure: the chart's name, its axis, its key, its table and its empty state. */
export function copyOf(measure: SharedMeasure, effort: string, windowText: string) {
  const steps = `Each line steps from one Sunday to the next, and breaks where a week has no value.`
  // A point is the best of its window, not an average, so a low point can only be a window of easy efforts.
  const lowPoint =
    'A low point can be a window of easy efforts: each is the best in its window, not an average.'
  if (measure === 'grade') {
    return {
      title: `Age grade of your best ${effort}, trailing ${windowText}`,
      description: `Run and ride age grades for the best ${effort} in each trailing ${windowText}, on one scale. Run is as recorded. Ride is estimated through its running equivalent, drawn dashed with rings and a band for its range.`,
      note: `Each point grades your best ${effort} in the ${windowText} to that Sunday, at the age on the day of that effort. ${lowPoint} ${steps}`,
      caption: `Each week ends on a Sunday. Each grade is the best ${effort} in the ${windowText} that end that week, at the age on the day of that effort. Ride grades are estimates, with their range.`,
      axisTitle: 'Age grade (%)',
      empty: 'Add runs or rides in more than one week to see your age grades',
      runHeading: 'Run grade',
      rideHeading: 'Ride grade, estimated',
      runLegend: 'Run, as recorded',
      rideLegend: 'Ride, estimated',
    }
  }
  return {
    title: `Energy rate of your best ${effort}, trailing ${windowText}`,
    description: `Run and ride energy rate in W/kg for the best ${effort} in each trailing ${windowText}, on one scale.`,
    note: `Each point is your best ${effort} in the ${windowText} to that Sunday, in metabolic W/kg. ${lowPoint} ${steps}`,
    caption: `Each week ends on a Sunday. Each value is the best ${effort} in the ${windowText} that end that week, in metabolic W/kg.`,
    axisTitle: 'Energy rate (W/kg)',
    empty: 'Add runs or rides in more than one week to see your energy rate',
    runHeading: 'Run (W/kg)',
    rideHeading: 'Ride (W/kg)',
    runLegend: 'Run',
    rideLegend: 'Ride',
  }
}

/** Grades are drawn in per cent, so the axis reads in whole steps. Energy stays in W/kg. */
export function plotted(measure: SharedMeasure, value: number): number {
  return measure === 'grade' ? value * 100 : value
}

export function formatValue(measure: SharedMeasure, value: number): string {
  return measure === 'grade' ? formatGrade(value) : formatWkg(value)
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
export function singleValueText(
  week: SharedWeek,
  measure: SharedMeasure,
  rideKnown: boolean,
): string {
  const parts = [
    week.run === null ? null : `Run ${formatValue(measure, week.run)}`,
    rideKnown && week.ride !== null ? `Ride ${formatValue(measure, week.ride)}` : null,
  ].flatMap((part) => (part === null ? [] : [part]))
  return `Only one week has a value: ${parts.join(' and ')}, week ending ${weekDay(week.endMs)}. A trend needs two weeks with values.`
}

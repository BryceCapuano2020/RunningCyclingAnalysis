import { levelOf } from '@rca/core/grade'
import { ENERGY_RATE_UNIT, formatEnergyRate, formatEnergyRateValue } from '@rca/core/units'
import { formatGrade } from '../gradeFormat'
import type { SharedWeek } from './gradeTrend'
import { STEPPED_LINE_TEXT, weekDay } from './trendText'

/** Which measure a shared trend shows: each sport's age grade, or its energy rate in metabolic W/kg. */
export type SharedMeasure = 'grade' | 'energy'

/** The level a grade falls in, which the tooltip names, or nothing for an energy value. */
export function levelNote(measure: SharedMeasure, value: number): string | undefined {
  if (measure === 'energy') return undefined
  const level = levelOf(value)
  return level === null ? undefined : level
}

/**
 * The empty message of a trend that holds cycling for want of a weight, when only a ride has a value. It
 * says why the chart is empty, and the note under it says the rest.
 */
export const HELD_EMPTY = 'Your rides are held until you add a weight on Profile.'

/** A point is the best of its window, not an average, so a low point can only be a window of easy efforts. */
const LOW_POINT = 'A low point is a window of easy efforts, not an average.'
/** The line's steps, which the caption says, so that the note under the chart is one line of meaning. */
const STEPS = STEPPED_LINE_TEXT

/** The words of each measure: the chart's name, its axis, its key, its table and its empty state. */
export function copyOf(measure: SharedMeasure, effort: string, windowText: string) {
  if (measure === 'grade') {
    return {
      title: `Age grade of your best ${effort}, trailing ${windowText}`,
      description: `Run and ride age grades for the best ${effort} in each trailing ${windowText}, on one scale. Run is as recorded. Ride is estimated through its running equivalent, drawn dashed with rings and a band for its range.`,
      note: `Each point is the best ${effort} in the ${windowText} to that Sunday. ${LOW_POINT}`,
      caption: `Each grade is the best ${effort} in the ${windowText} that end that week, at the age on the day of that effort. Ride grades are estimates, with their range. ${STEPS}`,
      axisTitle: 'Age grade',
      empty: 'Add runs or rides in more than one week to see your age grades',
      runHeading: 'Run grade',
      rideHeading: 'Ride grade, estimated',
      runLegend: 'Run, as recorded',
      rideLegend: 'Ride, estimated',
    }
  }
  return {
    title: `Energy rate of your best ${effort}, trailing ${windowText}`,
    description: `Run and ride energy rate in ${ENERGY_RATE_UNIT} for the best ${effort} in each trailing ${windowText}, on one scale.`,
    note: `Each point is the best ${effort} in the ${windowText} to that Sunday, in ${ENERGY_RATE_UNIT}. ${LOW_POINT}`,
    caption: `Each value is the best ${effort} in the ${windowText} that end that week, in ${ENERGY_RATE_UNIT}. ${STEPS}`,
    axisTitle: `Energy rate (${ENERGY_RATE_UNIT})`,
    empty: 'Add runs or rides in more than one week to see your energy rate',
    runHeading: `Run (${ENERGY_RATE_UNIT})`,
    rideHeading: `Ride (${ENERGY_RATE_UNIT})`,
    runLegend: 'Run',
    rideLegend: 'Ride',
  }
}

/** Grades are drawn in per cent, so the axis reads in whole steps. Energy stays in metabolic W/kg. */
export function plotted(measure: SharedMeasure, value: number): number {
  return measure === 'grade' ? value * 100 : value
}

/** A value in words, for a tooltip, a note or an end label: an energy rate carries its unit. */
export function formatValue(measure: SharedMeasure, value: number): string {
  return measure === 'grade' ? formatGrade(value) : formatEnergyRate(value)
}

/** A table cell's value. An energy rate is a bare number, since its column heading names the unit. */
export function tableValue(measure: SharedMeasure, value: number): string {
  return measure === 'grade' ? formatGrade(value) : formatEnergyRateValue(value)
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

import { shortestEffortMin } from '@rca/core/display'
import { hasEnoughZoneTime, mainZone, sameEnteredReferences } from '@rca/core/zones'
import type { MeasureTime, ZoneMeasure, ZoneWindow } from '@rca/core/zones'
import type { Sport } from '@rca/core/types'
import { formatTotalTime } from '@rca/core/units'
import type { Property } from './components/property'

/** The section's name, in its heading. */
export const TIME_IN_ZONES_NAME = 'Time in zones'

/** A measure as a row label names it. Power is measured, since an estimate is never counted. */
export const ROW_LABEL: Record<ZoneMeasure, string> = {
  heartRate: 'Heart rate',
  power: 'Measured power',
  pace: 'Pace',
}

/**
 * What gives a measure zones when none is entered. A pace and a power are cut from the sport's threshold estimate, which any
 * effort its duration table reads gives (`shortestEffortMin`), so they lack zones only without one in the year. A heart rate is
 * cut from the highest on file, so it lacks them only without a heart rate.
 */
export const THRESHOLD_NEEDS: Record<ZoneMeasure, string> = {
  heartRate: 'Enter your max heart rate on Profile to get them.',
  pace: `A run of ${shortestEffortMin('run')} min or more sets your pace zones.`,
  power: `A ride of ${shortestEffortMin('ride')} min or more sets your power zones.`,
}

/** A share as a whole percent. A share too small to round up reads "<1%", so it is not shown as none, and one
 * too close to all of it to round down reads ">99%", so it is not shown as all. */
export function percentText(share: number): string {
  if (share <= 0) return '0%'
  if (share >= 1) return '100%'
  if (share >= 0.995) return '>99%'
  return share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`
}

/** A zone's time as the page writes durations, with whole seconds kept under an hour. */
export function zoneTimeText(seconds: number): string {
  return formatTotalTime(Math.round(seconds))
}

/**
 * The measures of a period that have enough time to describe, most time first. Over all time, the last window there is,
 * (`relaxed`) whatever the library holds is described.
 */
export function describable(rows: readonly MeasureTime[], relaxed = false): MeasureTime[] {
  const enough = (row: MeasureTime) =>
    relaxed ? row.counted > 0 && row.totalSeconds > 0 : hasEnoughZoneTime(row)
  return rows.filter(enough).sort((a, b) => b.totalSeconds - a.totalSeconds)
}

/** What says which stretch the bars are of, when it is wider than the period. */
export const ZONE_WINDOW_VALUE: Record<ZoneWindow, string> = {
  year: 'Last 12 months',
  all: 'All time',
}

/** The row for one activity's measure: the zone that held most of the time, and its share. Null without time. */
export function mainZoneRow(
  measure: ZoneMeasure,
  time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>,
): Property | null {
  const main = mainZone(time)
  if (main === null) return null
  return {
    label: 'Most time',
    value: `${ROW_LABEL[measure]} zone ${main.level}, ${percentText(main.share)}`,
  }
}

/**
 * One short line of what changes what the bars mean: the stretch they are of when it is wider than the period, and the
 * measures whose zones changed since the period before (so they are not compared). Null when there is nothing to say.
 */
export function zoneNoteLine(
  rows: readonly MeasureTime[],
  previous: readonly MeasureTime[] | null,
  zoneWindow?: ZoneWindow,
): string | null {
  const parts = [
    ...(zoneWindow === undefined ? [] : [ZONE_WINDOW_VALUE[zoneWindow]]),
    ...zonesChangedRows(rows, previous),
  ]
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * The measures whose zones changed between the periods, which is why they are not compared: a change in shares could be
 * the zones moving, not the athlete. Nothing when the zones match, or when the period before has too little time.
 */
export function zonesChangedRows(
  rows: readonly MeasureTime[],
  previous: readonly MeasureTime[] | null,
): string[] {
  return rows.flatMap((row) => {
    const before = previous?.find((each) => each.measure === row.measure)
    return before !== undefined && hasEnoughZoneTime(before) && !sameEnteredReferences(before, row)
      ? [`${ROW_LABEL[row.measure]} zones changed, not compared`]
      : []
  })
}

/** The link under the bars to where zones are set: to set them while any are estimated, to edit them once all are set. */
export function zonesLinkText(rows: readonly MeasureTime[]): string {
  const entered = rows.reduce((n, row) => n + row.entered, 0)
  return entered === 0 ? 'Set your zones on Profile' : 'Edit your zones on Profile'
}

/** What each sport needs to show its time in zones. */
const NEED: Record<Sport, string> = {
  run: 'heart rate, or a threshold pace entered on Profile',
  ride: 'heart rate or a power meter',
}

/** What the section needs when there is no time in zones to show, or null when there is some. */
export function timeInZonesLack(
  sport: Sport,
  rows: readonly MeasureTime[],
  relaxed = false,
): string | null {
  if (describable(rows, relaxed).length > 0) return null
  const withoutZones = rows.some((row) => row.noZones > 0 && row.counted === 0)
  if (withoutZones) return 'Needs a max heart rate or a threshold, entered on Profile.'
  return `Needs an activity with ${NEED[sport]}.`
}

import { hasEnoughZoneTime, mainZone, sameEnteredReferences } from '@rca/core/zones'
import type { MeasureTime, ZoneMeasure, ZoneWindow } from '@rca/core/zones'
import type { Sport } from '@rca/core/types'
import { formatTotalTime } from '@rca/core/units'
import { formatCount } from './format/count'
import { SPORT_PLURAL } from './sports'

/** The section's name, in its heading. */
export const TIME_IN_ZONES_NAME = 'Time in zones'

/** A measure as a sentence names it: "heart rate zone 2", "power zone 3". */
const IN_SENTENCE: Record<ZoneMeasure, string> = {
  heartRate: 'heart rate',
  power: 'power',
  pace: 'pace',
}

/** A measure as a row label names it. Power is measured, since an estimate is never counted. */
export const ROW_LABEL: Record<ZoneMeasure, string> = {
  heartRate: 'Heart rate',
  power: 'Measured power',
  pace: 'Pace',
}

/**
 * What gives a measure zones when none is entered. A pace and a power are cut from a fitted threshold and, where none
 * stands, from the best 30 min or 20 min on file, so they lack zones only without an effort of 20 min. A heart rate is cut
 * from the highest on file, so it lacks them only without a heart rate.
 */
export const THRESHOLD_NEEDS: Record<ZoneMeasure, string> = {
  heartRate: 'Enter your max heart rate on Profile to get them.',
  pace: 'A run of 20 min or more sets your pace zones.',
  power: 'A ride of 20 min or more sets your power zones.',
}

/** What an activity has to record for a measure to count it. */
const READING: Record<ZoneMeasure, string> = {
  heartRate: 'heart rate',
  power: 'measured power',
  pace: 'pace',
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

/** The line that says which stretch the bars are of, when it is wider than the period. */
export const ZONE_WINDOW_LINE: Record<ZoneWindow, string> = {
  year: 'Last 12 months.',
  all: 'All time.',
}

/** The lede of one activity's measure: the zone that held most of the time, or all of it. Null without time. */
export function activityLede(
  sport: Sport,
  measure: ZoneMeasure,
  time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>,
): string | null {
  const main = mainZone(time)
  if (main === null) return null
  const percent = percentText(main.share)
  const at = `${IN_SENTENCE[measure]} zone ${main.level} (${percent})`
  // Only a share that is all of the time says so; 99.6% reads "Most of … (>99%)".
  if (main.share >= 1) return `All of this ${sport} was in ${at}.`
  return main.share > 0.5
    ? `Most of this ${sport} was in ${at}.`
    : `This ${sport} spent the most time in ${at}.`
}

/**
 * Under the chart, one line for each measure that left activities out: how many, and why. An activity
 * with no reading of the measure is told apart from one with a reading but no zones for its date.
 */
export function leftOutNotes(sport: Sport, rows: readonly MeasureTime[]): string[] {
  return rows.flatMap((row) => {
    const total = row.counted + row.noData + row.setAside + row.noZones
    const notes: string[] = []
    const of = (n: number) => `${formatCount(n)} of ${formatCount(total)} ${SPORT_PLURAL[sport]}`
    if (row.setAside > 0) notes.push(`${of(row.setAside)} had heart rate set aside.`)
    if (row.noData > 0) notes.push(`${of(row.noData)} had no ${READING[row.measure]} to count.`)
    if (row.noZones > 0) {
      // A heart rate has zones from the highest on file, so it lacks them only with no heart rate to cut them from.
      const need = ` ${THRESHOLD_NEEDS[row.measure]}`
      notes.push(
        `${of(row.noZones)} had no ${IN_SENTENCE[row.measure]} zones for their date.${need}`,
      )
    }
    return notes
  })
}

/**
 * A line for each measure whose zones changed between the periods, which is why they are not compared:
 * a change in shares could be the zones moving, not the athlete. Nothing when the zones match, or when
 * the period before has too little time to compare at all.
 */
export function zonesChangedNotes(
  rows: readonly MeasureTime[],
  previous: readonly MeasureTime[] | null,
): string[] {
  return rows.flatMap((row) => {
    const before = previous?.find((each) => each.measure === row.measure)
    return before !== undefined && hasEnoughZoneTime(before) && !sameEnteredReferences(before, row)
      ? [
          `${ROW_LABEL[row.measure]} zones changed since the previous period, so the two are not compared.`,
        ]
      : []
  })
}

/** Where the zones came from, over the measures shown, with where to change it. */
export function zoneSourceNote(rows: readonly MeasureTime[]): string {
  const counted = rows.reduce((n, row) => n + row.counted, 0)
  const entered = rows.reduce((n, row) => n + row.entered, 0)
  if (entered === 0) return 'Zones estimated. Set your own on Profile.'
  if (entered === counted) return 'Zones set on Profile.'
  return 'Zones set on Profile where you have them, estimated elsewhere.'
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

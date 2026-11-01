import {
  EASY_THROUGH,
  HARD_FROM,
  MIN_ZONE_ACTIVITIES,
  MIN_ZONE_SECONDS,
  biggestShift,
  effortSplit,
  hasEnoughZoneTime,
  mainZone,
  sameEnteredReferences,
} from '@rca/core/zones'
import type { MeasureTime, ZoneMeasure } from '@rca/core/zones'
import type { Sport } from '@rca/core/types'
import { formatTotalTime } from '@rca/core/units'
import { plural } from './components/plural'
import { lowerFirst, upperFirst } from './format/firstLetter'
import { SPORT_PLURAL } from './sports'

/** The section's name, in its heading. */
export const TIME_IN_ZONES_NAME = 'Time in zones'

/** A zone has to move this much of the period's time, as a share, for the lede to call it a change. */
export const MIN_SHIFT = 0.05

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

/** What a sport's time is called in a sentence about its share of it. */
const TIME_NOUN: Record<Sport, string> = { run: 'running', ride: 'riding' }

/**
 * The time a measure's shares are of, in a sentence. They are shares of the time with a reading, which
 * leaves out the activities and seconds that had none, so the sentence says so.
 */
const WITH_READING: Record<ZoneMeasure, string> = {
  heartRate: 'with heart rate',
  power: 'with measured power',
  pace: 'with a pace reading',
}

/**
 * What gives a measure zones when none is entered and the half year before the date holds no fit (and no fit
 * within a year does): the hard, even efforts a threshold is fitted to. Only a pace and a power are found this way.
 */
export const THRESHOLD_NEEDS: Record<ZoneMeasure, string> = {
  heartRate:
    'None of your efforts reached near your maximum, so there is no max to cut zones from. Enter your max heart rate on Profile to get them.',
  pace: 'A hard, even 3–5 min effort and a hard 20 min effort set your pace zones.',
  power: 'A hard, even 3–5 min effort and a hard 20 min effort set your power zones.',
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
 * The zones that count as easy, named by their measure, such as "pace zones 1 and 2". Pace, heart rate and power cut
 * their zones from different references, so the same zone number is not the same effort, and the sentence says whose.
 */
function easyZones(measure: ZoneMeasure): string {
  const last = EASY_THROUGH[measure]
  const name = IN_SENTENCE[measure]
  return last === 2 ? `${name} zones 1 and 2` : `${name} zones 1 to ${last}`
}

/** The measures of a period that have enough time to describe, most time first. */
export function describable(rows: readonly MeasureTime[]): MeasureTime[] {
  return rows.filter(hasEnoughZoneTime).sort((a, b) => b.totalSeconds - a.totalSeconds)
}

/**
 * The one sentence a sport's section opens with. When the zone that moved most against the period
 * before moved by at least MIN_SHIFT of the time, it says that; otherwise it says how much of the time
 * was easy and how much hard. It reads the measure with the most time, so the page leads with the
 * best-supported one.
 */
export function periodLede(
  sport: Sport,
  rows: readonly MeasureTime[],
  previous: readonly MeasureTime[] | null,
  previousLabel: string | null,
): string | null {
  const [lead] = describable(rows)
  if (lead === undefined) return null
  const before = previous?.find((row) => row.measure === lead.measure)
  const shift =
    before !== undefined &&
    hasEnoughZoneTime(before) &&
    sameEnteredReferences(before, lead) &&
    previousLabel !== null
      ? biggestShift(before, lead)
      : null
  const name = IN_SENTENCE[lead.measure]
  if (
    shift !== null &&
    previousLabel !== null &&
    Math.abs(shift.after - shift.before) >= MIN_SHIFT
  ) {
    const direction = shift.after > shift.before ? 'up' : 'down'
    return `${upperFirst(name)} zone ${shift.level} took ${percentText(shift.after)} of your ${TIME_NOUN[sport]} time ${WITH_READING[lead.measure]}, ${direction} from ${percentText(shift.before)} in the ${lowerFirst(previousLabel)}.`
  }
  const split = effortSplit(lead)
  return `${percentText(split.easy)} of your ${TIME_NOUN[sport]} time ${WITH_READING[lead.measure]} was easy (${easyZones(lead.measure)}), and ${percentText(split.hard)} was hard (${IN_SENTENCE[lead.measure]} zones ${HARD_FROM[lead.measure]} and up).`
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
    const of = (n: number) => `${n} of ${total} ${SPORT_PLURAL[sport]}`
    if (row.setAside > 0) notes.push(`${of(row.setAside)} had heart rate set aside.`)
    if (row.noData > 0) notes.push(`${of(row.noData)} had no ${READING[row.measure]} to count.`)
    if (row.noZones > 0) {
      // A heart rate has zones from any maximum that can be one, so it lacks them only where no effort reached near it.
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
  if (entered === 0) {
    return 'Estimated from your activities. Set your own on Profile.'
  }
  if (entered === counted) return 'Zones follow the settings you entered on Profile.'
  return 'Zones follow your Profile settings where you have them, and are estimated where you do not.'
}

/** What each sport needs to show its time in zones. */
const NEED: Record<Sport, string> = {
  run: 'heart rate, or a threshold pace entered on Profile',
  ride: 'heart rate or a power meter',
}

/** What the section needs when there is no time in zones to show, or null when there is some. */
export function timeInZonesLack(sport: Sport, rows: readonly MeasureTime[]): string | null {
  if (describable(rows).length > 0) return null
  const withoutZones = rows.some((row) => row.noZones > 0 && row.counted === 0)
  if (withoutZones) {
    return 'Needs a max heart rate or a threshold, entered on Profile or, for a threshold, found from your activities.'
  }
  const hours = MIN_ZONE_SECONDS / 3600
  return `Needs ${plural(MIN_ZONE_ACTIVITIES, 'activity', 'activities')} with ${NEED[sport]}, and ${plural(hours, 'hour')} of them.`
}

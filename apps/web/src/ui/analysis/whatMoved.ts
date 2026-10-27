import { dedupeKey } from '@rca/core/session'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPercent } from '@rca/core/units'
import { gapOfHeadline } from '../balanceGap'
import { balanceOfPick, type BalanceReading } from '../components/balanceScale'
import { plural } from '../components/plural'
import { pickHeadline } from '../components/pickHeadline'
import { PER } from '../format/units'
import type { AgeProfile } from '../grades'
import { headlineGrades } from '../grades'
import { curveOf, distanceRecords, effortLabel, sportRecords, threshold } from '../records'
import type { SportNumber, SportRecord } from '../records'
import { SPORT_NOUN, SPORT_ORDER } from '../sports'
import { addedSentence } from './copy'
import type { ImportChange } from './importState'

/** One change in the athlete's numbers. `spoken` replaces the arrow and the figures for screen readers. */
export interface MovedItem {
  text: string
  spoken?: string
}

/** The most changes the summary lists: thresholds, then the balance, then bests. */
const MAX_ITEMS = 4

/** A sport's threshold as a label, and its figures read aloud: a pace in minutes and seconds, or watts. */
const SPOKEN: Record<
  Sport,
  { label: string; number: (number: string) => string; unit: (units: UnitSystem) => string }
> = {
  run: { label: 'Threshold pace', number: spokenPace, unit: (units) => PER[units] },
  ride: { label: 'Threshold power', number: (number) => number, unit: () => 'watts' },
}

/** Whether a figure is a number to compare and say, rather than the dash that stands for none. */
function isFigure(figure: SportNumber): boolean {
  return /\d/.test(figure.number)
}

/** A threshold whose displayed value moved, such as "Threshold pace: 7:12 → 7:05 /mi". */
function thresholdItem(
  before: AnalysisResult,
  after: AnalysisResult,
  sport: Sport,
  settings: AthleteSettings,
  units: UnitSystem,
): MovedItem | null {
  const from = threshold(before, sport, settings.massKg, units)
  const to = threshold(after, sport, settings.massKg, units)
  if (from === null || to === null || from.value === to.value) return null
  if (!isFigure(from) || !isFigure(to)) return null
  const { label, unit } = SPOKEN[sport]
  return {
    text: `${label}: ${from.number} → ${to.number} ${from.unit}`,
    spoken: `${label} from ${from.number} to ${to.number} ${unit(units)}`,
  }
}

/** A balance's size in its own unit, in words: "6 points", or "12%" of energy. */
function amountText(unit: BalanceReading['unit'], value: number): string {
  if (unit === 'percent') return formatPercent(value / 100)
  return plural(Math.round(value), 'point')
}

/** The lean of the balance now, against the lean before, in words. Both sides share one unit. */
function leanItem(before: BalanceReading, after: BalanceReading): MovedItem | null {
  if (after.lean === 'even') {
    return before.lean === 'even' ? null : { text: 'Your running and cycling are now in balance' }
  }
  if (before.lean !== after.lean) {
    return { text: `Your balance now leans toward ${SPORT_NOUN[after.lean]}` }
  }
  const from = Math.abs(before.lead.centre)
  const to = Math.abs(after.lead.centre)
  const fromText = amountText(after.unit, from)
  const toText = amountText(after.unit, to)
  if (fromText === toText) return null
  const direction = to < from ? 'less' : 'more'
  const sport = SPORT_NOUN[after.lean]
  return {
    text: `Your balance now leans ${direction} toward ${sport} (${fromText} → ${toText})`,
    spoken: `Your balance now leans ${direction} toward ${sport}, from ${fromText} to ${toText}`,
  }
}

/**
 * The balance, read as the Balance page reads it: in points when both results grade both sports,
 * otherwise in energy. Energy only compares at the same duration and with the same heart-rate
 * calibration, and points never compare with energy.
 */
function balanceItem(
  before: AnalysisResult,
  after: AnalysisResult,
  profile: AgeProfile | null,
  weighted: boolean,
): MovedItem | null {
  // Held while no weight is entered: a ride's figures wait for it, so the balance does too.
  if (!weighted) return null
  const pickBefore = pickHeadline(before.comparison)
  const pickAfter = pickHeadline(after.comparison)
  const gapBefore = profile === null ? null : gapOfHeadline(headlineGrades(before, profile))
  const gapAfter = profile === null ? null : gapOfHeadline(headlineGrades(after, profile))
  const readingBefore = balanceOfPick(gapBefore, pickBefore)
  const readingAfter = balanceOfPick(gapAfter, pickAfter)
  if (readingBefore === null || readingAfter === null) return null
  if (readingBefore.unit !== readingAfter.unit) return null
  if (readingBefore.unit === 'percent') {
    if (pickBefore === null || pickAfter === null) return null
    const sameHeadline =
      pickBefore.point.durationS === pickAfter.point.durationS &&
      pickBefore.calibrated === pickAfter.calibrated
    if (!sameHeadline) return null
  }
  return leanItem(readingBefore, readingAfter)
}

/** The best at a duration, in its curve's own unit: W/kg for running, watts for riding; NaN if none. */
function bestAt(result: AnalysisResult, sport: Sport, durationS: number): number {
  return curveOf(result, sport).find((point) => point.durationS === durationS)?.value ?? Number.NaN
}

/** A time read aloud: "1 hour 27 minutes 54 seconds", or "6 minutes 42 seconds". */
function spokenSeconds(seconds: number): string {
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const parts = [
    hours > 0 ? plural(hours, 'hour') : null,
    minutes > 0 ? plural(minutes, 'minute') : null,
    plural(total % 60, 'second'),
  ]
  return parts.filter((part): part is string => part !== null).join(' ')
}

/** A record duration read aloud: "20 minutes", "1 minute" or "1 hour". */
function spokenDuration(durationS: number): string {
  return durationS % 3600 === 0
    ? plural(durationS / 3600, 'hour')
    : plural(durationS / 60, 'minute')
}

/** A pace read aloud: "7:05" becomes "7 minutes 5 seconds". */
function spokenPace(number: string): string {
  const [minutes = 0, seconds = 0] = number.split(':').map(Number)
  return `${plural(minutes, 'minute')} ${plural(seconds, 'second')}`
}

/** A record's figure read aloud: "6 minutes 40 seconds per mile", or "262 watts". */
function spokenFigure(record: SportRecord, sport: Sport, units: UnitSystem): string {
  return `${SPOKEN[sport].number(record.number)} ${SPOKEN[sport].unit(units)}`
}

/**
 * The workouts an analysis holds, by their sport and start time, so a workout counts as on file
 * whatever its activity id. A copy that replaces one is not new.
 */
function workoutsOn(result: AnalysisResult): Set<string> {
  return new Set(result.activities.map((activity) => dedupeKey(activity.sport, activity.startMs)))
}

/**
 * The record durations that an activity the import added set, and that beat the earlier best with
 * a change in the displayed value. An activity counts as on file when its workout matches (sport
 * and start time), whatever its id, so a copy that replaces one is not new.
 */
function bestItems(
  before: AnalysisResult,
  after: AnalysisResult,
  massKg: number,
  units: UnitSystem,
  sports: readonly Sport[],
): MovedItem[] {
  const onFile = workoutsOn(before)
  const items: MovedItem[] = []
  for (const sport of sports) {
    const earlierRecords = sportRecords(before, sport, massKg, units)
    for (const record of sportRecords(after, sport, massKg, units)) {
      const activity = record.activity
      if (activity === null || onFile.has(dedupeKey(activity.sport, activity.startMs))) continue
      if (!isFigure(record)) continue
      const earlier = earlierRecords.find((r) => r.durationS === record.durationS)
      if (earlier?.value === record.value) continue
      const earlierBest = bestAt(before, sport, record.durationS)
      if (Number.isFinite(earlierBest) && bestAt(after, sport, record.durationS) <= earlierBest) {
        continue
      }
      items.push({
        text: `New best ${effortLabel(record.durationS)} ${sport}: ${record.value}`,
        spoken: `New best ${spokenDuration(record.durationS)} ${sport}: ${spokenFigure(record, sport, units)}`,
      })
    }
  }
  return items
}

/**
 * The run distance bests that an activity the import added set, and that are faster than the
 * earlier best. Like the duration bests, a workout on file does not count.
 */
function distanceItems(
  before: AnalysisResult,
  after: AnalysisResult,
  units: UnitSystem,
): MovedItem[] {
  // A run on file that predates distance bests has none, so an earlier best may be missing: no
  // distance best is called new against a partial record.
  if (before.activities.some((a) => a.sport === 'run' && a.distanceBests === undefined)) return []
  const onFile = workoutsOn(before)
  const earlier = distanceRecords(before.activities, units).records
  const items: MovedItem[] = []
  for (const record of distanceRecords(after.activities, units).records) {
    if (onFile.has(dedupeKey(record.activity.sport, record.activity.startMs))) continue
    const earlierBest = earlier.find((candidate) => candidate.distanceM === record.distanceM)
    if (earlierBest !== undefined && earlierBest.seconds <= record.seconds) continue
    items.push({
      text: `New best ${record.label}: ${record.time}`,
      spoken: `New best ${record.label}: ${spokenSeconds(record.seconds)}`,
    })
  }
  return items
}

/**
 * What an import moved in the athlete's numbers: thresholds, then the balance, then new duration
 * bests, at most four. Only a change that alters the displayed, rounded value is listed. There is
 * no list without an earlier analysis to compare with. Without a weight (`weighted` false) the ride
 * items wait for it: the ride threshold, the ride bests and the balance.
 */
export function whatMoved(
  before: AnalysisResult | null,
  after: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  profile: AgeProfile | null,
  weighted = true,
): MovedItem[] {
  if (before === null) return []
  // Without a weight the ride's figures are worked out from the placeholder, so they wait for it.
  const changes = [
    thresholdItem(before, after, 'run', settings, units),
    weighted ? thresholdItem(before, after, 'ride', settings, units) : null,
    balanceItem(before, after, profile, weighted),
  ].filter((item): item is MovedItem => item !== null)
  const sports: readonly Sport[] = weighted ? SPORT_ORDER : ['run']
  const bests = [
    ...bestItems(before, after, settings.massKg, units, sports),
    ...distanceItems(before, after, units),
  ]
  return [...changes, ...bests].slice(0, MAX_ITEMS)
}

/**
 * The list the summary shows for an import. It is empty unless the summary says something was
 * added: a copy that replaces an activity on file changes the numbers without adding one.
 */
export function listedMoves(
  change: ImportChange | null,
  settings: AthleteSettings,
  units: UnitSystem,
  profile: AgeProfile | null,
  weighted = true,
): MovedItem[] {
  if (change === null || change.after === null || addedSentence(change.outcome) === null) {
    return []
  }
  return whatMoved(change.before, change.after, settings, units, profile, weighted)
}

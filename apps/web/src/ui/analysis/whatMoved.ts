import { dedupeKey } from '@rca/core/session'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Interval, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPercent } from '@rca/core/units'
import { leadOf, leanOf } from '../components/headlineText'
import { plural } from '../components/plural'
import type { HeadlinePick } from '../components/pickHeadline'
import { pickHeadline } from '../components/pickHeadline'
import { PER } from '../format/units'
import { curveOf, sportRecords, threshold } from '../records'
import type { SportNumber, SportRecord } from '../records'
import { SPORT_NOUN } from '../sports'
import { addedSentence } from './copy'
import type { ImportChange } from './importState'

/** One change in the athlete's numbers. `spoken` replaces the arrow and the figures for screen readers. */
export interface MovedItem {
  text: string
  spoken?: string
}

/** The most changes the summary lists: thresholds, then the balance, then bests. */
const MAX_ITEMS = 4
const SPORTS: Sport[] = ['run', 'ride']

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
  const label = sport === 'run' ? 'Threshold pace' : 'Threshold power'
  const spokenUnit = sport === 'run' ? PER[units] : 'watts'
  return {
    text: `${label}: ${from.number} → ${to.number} ${from.unit}`,
    spoken: `${label} from ${from.number} to ${to.number} ${spokenUnit}`,
  }
}

/** The lean of the balance as it is now, against the lean before, in words. */
function leanItem(before: Interval, after: Interval): MovedItem | null {
  const leanBefore = leanOf(before)
  const leanAfter = leanOf(after)
  if (leanAfter === 'even') {
    return leanBefore === 'even' ? null : { text: 'Your running and cycling are now in balance' }
  }
  if (leanBefore !== leanAfter) {
    return { text: `Your balance now leans toward ${SPORT_NOUN[leanAfter]}` }
  }
  const fromText = formatPercent(leadOf(before, leanAfter))
  const toText = formatPercent(leadOf(after, leanAfter))
  if (fromText === toText) return null
  const direction = leadOf(after, leanAfter) < leadOf(before, leanAfter) ? 'less' : 'more'
  const sport = SPORT_NOUN[leanAfter]
  return {
    text: `Your balance now leans ${direction} toward ${sport} (${fromText} → ${toText})`,
    spoken: `Your balance now leans ${direction} toward ${sport}, from ${fromText} to ${toText}`,
  }
}

/**
 * The balance, when both headlines are the same duration and both are calibrated or both are not.
 * Headlines at different durations, or one calibrated by heart rate and one not, do not compare.
 */
function balanceItem(before: HeadlinePick, after: HeadlinePick): MovedItem | null {
  if (before.point.durationS !== after.point.durationS || before.calibrated !== after.calibrated) {
    return null
  }
  return leanItem(before.point.ratio, after.point.ratio)
}

/** The best at a duration, in its curve's own unit: W/kg for running, watts for riding; NaN if none. */
function bestAt(result: AnalysisResult, sport: Sport, durationS: number): number {
  return curveOf(result, sport).find((point) => point.durationS === durationS)?.value ?? Number.NaN
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
  return sport === 'run' ? `${spokenPace(record.number)} ${PER[units]}` : `${record.number} watts`
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
): MovedItem[] {
  const onFile = new Set(
    before.activities.map((activity) => dedupeKey(activity.sport, activity.startMs)),
  )
  const items: MovedItem[] = []
  for (const sport of SPORTS) {
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
        text: `New best ${formatDuration(record.durationS)} ${sport}: ${record.value}`,
        spoken: `New best ${spokenDuration(record.durationS)} ${sport}: ${spokenFigure(record, sport, units)}`,
      })
    }
  }
  return items
}

/**
 * What an import moved in the athlete's numbers: thresholds, then the balance, then new duration
 * bests, at most four. Only a change that alters the displayed, rounded value is listed. There is
 * no list without an earlier analysis to compare with.
 */
export function whatMoved(
  before: AnalysisResult | null,
  after: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
): MovedItem[] {
  if (before === null) return []
  const headlineBefore = pickHeadline(before.comparison)
  const headlineAfter = pickHeadline(after.comparison)
  const balance =
    headlineBefore && headlineAfter ? balanceItem(headlineBefore, headlineAfter) : null
  const changes = [
    thresholdItem(before, after, 'run', settings, units),
    thresholdItem(before, after, 'ride', settings, units),
    balance,
  ].filter((item): item is MovedItem => item !== null)
  return [...changes, ...bestItems(before, after, settings.massKg, units)].slice(0, MAX_ITEMS)
}

/**
 * The list the summary shows for an import. It is empty unless the summary says something was
 * added: a copy that replaces an activity on file changes the numbers without adding one.
 */
export function listedMoves(
  change: ImportChange | null,
  settings: AthleteSettings,
  units: UnitSystem,
): MovedItem[] {
  if (change === null || change.after === null || addedSentence(change.outcome) === null) {
    return []
  }
  return whatMoved(change.before, change.after, settings, units)
}

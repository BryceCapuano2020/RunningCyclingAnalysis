import type { ChangeEvidence } from '@rca/core/change/types'
import { callAt, directionOf, verdictOfCall } from '@rca/core/change/types'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport, SportCurves } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatPower } from '@rca/core/units'
import { formatDayMonth } from '../format/date'
import { withThe } from '../previousLabel'
import { NO_CLEAR_CHANGE, recordChange } from '../recordChange'
import { effortLabel, valueAt } from '../records'

/**
 * One thing that moved since the previous period: an arrow, its title and its line. Every item is one the change test
 * called: a best that left the band its two periods' efforts make by chance.
 */
export interface ChangeItem {
  key: string
  direction: 'up' | 'down'
  title: string
  body: string
}

/** The most items the strip lists. */
export const MAX_CHANGES = 4

/** What one comparison gave: null where it could not be made, else its item, or none when the figures are the same. */
type Compared = { item: ChangeItem | null } | null

/** The activity that set a curve's best at the headline duration, from the activities given. */
function setBy(
  curve: SportCurves['runCurve'],
  activities: readonly ActivitySummary[],
): ActivitySummary | null {
  const id = curve.find((point) => point.durationS === HEADLINE_DURATION_S)?.activityId
  return activities.find((activity) => activity.id === id) ?? null
}

/** A curve's best at the headline duration, in the curve's own unit; NaN when none. */
function bestOn(curves: Pick<SportCurves, 'runCurve' | 'rideCurve'>, sport: Sport): number {
  return valueAt(CURVE[sport](curves), HEADLINE_DURATION_S)
}

/** Each sport's curve in a set of curves. */
const CURVE: Record<
  Sport,
  (curves: Pick<SportCurves, 'runCurve' | 'rideCurve'>) => SportCurves['runCurve']
> = {
  run: (curves) => curves.runCurve,
  ride: (curves) => curves.rideCurve,
}

/** A best in the sport's own unit: a running flat speed in m/s, watts for a ride; NaN when it has none. */
const NATIVE: Record<Sport, (value: number) => number> = {
  run: (wkg) => metabolicToFlatSpeed(wkg),
  ride: (watts) => watts,
}

/** A best as the page writes it. */
const SHOWN: Record<Sport, (native: number, units: UnitSystem) => string> = {
  run: (speed, units) => formatPace(speed, units),
  ride: (watts) => formatPower(watts),
}

/** The title of a best that moved: what got better or worse, and for which effort, against the period before. */
const TITLE: Record<Sport, { up: string; down: string; unit: string }> = {
  run: { up: 'Faster', down: 'Slower', unit: 'run' },
  ride: { up: 'More power over', down: 'Less power over', unit: '' },
}

/** The title of a best against the period compared with, as one phrase: "Faster 20 min run than the previous 12 weeks". */
function bestTitle(sport: Sport, better: boolean, label: string): string {
  const { up, down, unit } = TITLE[sport]
  const duration = effortLabel(HEADLINE_DURATION_S)
  const kind = unit === '' ? '' : ` ${unit}`
  return `${better ? up : down} ${duration}${kind} than ${withThe(label)}`
}

/** A line that names the activity that set the best and its day, when it is among the activities on screen. */
function setOn(words: string, source: ActivitySummary | null): string {
  return source === null
    ? `${words}.`
    : `${words}. Set on ${source.name}, ${formatDayMonth(source.startMs)}.`
}

/**
 * A sport's best 20 minutes against the previous period's, in the figures the page shows. Listed only where the
 * change test calls the move a change; null where the periods hold too few efforts of that length for the test to
 * judge.
 */
function bestItem(
  sport: Sport,
  input: Pick<ChangesInput, 'result' | 'units' | 'change'> & {
    previous: SportCurves
    label: string
  },
): Compared {
  const { result, previous, units, label, change } = input
  const now = NATIVE[sport](bestOn(result, sport))
  const before = NATIVE[sport](bestOn(previous, sport))
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null
  // The strip is a headline, so a best is held to the stricter band.
  const call = callAt(change, sport, HEADLINE_DURATION_S)
  const verdict = verdictOfCall(call, 'headline')
  if (verdict === 'untested') return null
  // A move the test does not call is no clear change, so the strip lists nothing, as the curve says nothing.
  if (verdict === 'none') return { item: null }
  // Which way it moved is the call's, in the compared unit; the shown figures write the amount.
  const better = directionOf(call, 'headline') > 0
  const words = recordChange(sport, now, before, units, label, call) ?? ''
  if (words === '' || words.startsWith(NO_CLEAR_CHANGE)) return { item: null }
  const source = setBy(CURVE[sport](result), result.activities)
  return {
    item: {
      key: `${sport}-best`,
      direction: better ? 'up' : 'down',
      title: bestTitle(sport, better, label),
      body: setOn(`${SHOWN[sport](now, units)}, ${words}`, source),
    },
  }
}

export interface ChangesInput {
  result: AnalysisResult
  previous: SportCurves | null
  /** What the period is compared with: "Previous 12 weeks", or the months of an earlier window ("Jan to Mar"); null when there is none (all time). */
  previousLabel: string | null
  /** Whether each best differs from that period's by more than chance; null for all time. */
  change: ChangeEvidence | null
  units: UnitSystem
  /** False while no body weight is entered: a ride's figures wait for it, so its changes do too. */
  rideShown: boolean
}

/** What the strip says: what moved, at most four. None means the periods were compared and no best left what chance puts between them. */
export interface BalanceChangesResult {
  items: ChangeItem[]
}

/**
 * What moved against the period compared with, at most four: the rides' best 20 minutes, then the runs'. A change is listed
 * only where the change test calls it (and its figures differ as the page shows them), and only what could be compared is
 * listed. The balance's lean is not listed: it is read from each sport's threshold, which the period before holds no estimate
 * of, and the lead of the page states it once. Null when nothing could be compared, as under All time and where no earlier
 * window holds enough efforts to test: the strip is then left out.
 */
export function balanceChanges(input: ChangesInput): BalanceChangesResult | null {
  const { result, previous, previousLabel, units, rideShown, change } = input
  if (previous === null || previousLabel === null) return null
  const best = { result, previous, units, label: previousLabel, change }
  // The ride's best waits for the weight, so it is named here; the run's best does not.
  const outcomes = [rideShown ? bestItem('ride', best) : null, bestItem('run', best)]
  if (outcomes.every((outcome) => outcome === null)) return null
  const items = outcomes.flatMap((outcome) => (outcome?.item ? [outcome.item] : []))
  return { items: items.slice(0, MAX_CHANGES) }
}

/**
 * The strip's line when the change test called nothing: the periods were compared, and no best left what chance puts
 * between them. It names the length it judged (the headline's), since a shorter or longer best on a sport page may move.
 */
export function noChangeText(previousLabel: string): string {
  return `${NO_CLEAR_CHANGE} at ${effortLabel(HEADLINE_DURATION_S)} from ${withThe(previousLabel)}.`
}

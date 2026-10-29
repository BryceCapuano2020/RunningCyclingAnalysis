import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import { equivalenceFor } from '@rca/core/pipeline'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { HrCalibration, Sport, SportCurves } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatPower, paceSeconds } from '@rca/core/units'
import { activityMasses } from '../activityMasses'
import { gapOfHeadline } from '../balanceGap'
import type { BalanceGap } from '../balanceGap'
import { gapReading } from '../components/balanceScale'
import { rangeText } from '../components/headlineText'
import { plural } from '../components/plural'
import { formatDayMonth } from '../format/date'
import { headlineGrades } from '../grades'
import type { AgeProfile } from '../grades'
import { recordChange } from '../recordChange'
import { effortLabel, isEstimatedRecord, valueAt } from '../records'
import { SPORT_NOUN, SPORT_ORDER } from '../sports'

/**
 * What a change is, as evidence. `beyond` and `within` are claimed only against ranges both periods state:
 * ranges that do not overlap are beyond, and ranges that overlap are within, since the data cannot tell the
 * two figures apart. `recorded` is a best that was measured in both periods, and `estimated` a figure with
 * no range to judge by, or with watts that were estimated, so it claims neither.
 */
export type ChangeTag = 'beyond' | 'within' | 'recorded' | 'estimated'

export const TAG_TEXT: Record<ChangeTag, string> = {
  beyond: 'Beyond its range',
  within: 'Within its range',
  recorded: 'Recorded',
  estimated: 'Estimated',
}

/** One thing that moved since the previous period: an arrow, its title and line, and how far to trust it. */
export interface ChangeItem {
  key: string
  direction: 'up' | 'down'
  title: string
  body: string
  tag: ChangeTag
}

/** The most items the strip lists. */
export const MAX_CHANGES = 4

/** A 90% range, or another stated range: its low and high ends. */
export interface ChangeRange {
  low: number
  high: number
}

/**
 * Whether a change is beyond or within the ranges its figures state, or null where either period has none.
 * Beyond means the two ranges do not overlap; within means they do, so the data cannot tell the figures apart.
 * A range of one value says nothing, so it is no range.
 */
export function rangeVerdict(
  before: ChangeRange | null,
  now: ChangeRange | null,
): 'beyond' | 'within' | null {
  if (before === null || now === null) return null
  if (!(before.high > before.low) || !(now.high > now.low)) return null
  return before.low <= now.high && now.low <= before.high ? 'within' : 'beyond'
}

/** What one comparison gave: null where it could not be made, else its item, or none when the figures are the same. */
type Compared = { item: ChangeItem | null } | null

/** The sports in the order a positive lead favours them: running first, as every scale in the app does. */
const [FIRST, SECOND] = SPORT_ORDER

/** The sport a lead's sign favours. */
function favoured(lead: number): Sport {
  return lead > 0 ? FIRST : SECOND
}

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

/** How far a best moved in the figures the page shows, positive when it is better: whole seconds of pace, whole watts. */
const SHOWN_GAIN: Record<Sport, (now: number, before: number, units: UnitSystem) => number> = {
  run: (now, before, units) =>
    Math.round(paceSeconds(before, units)) - Math.round(paceSeconds(now, units)),
  ride: (now, before) => Math.round(now) - Math.round(before),
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

/** The title of a best against the previous period, as one phrase: "Faster 20 min run than the previous 12 weeks". */
function bestTitle(sport: Sport, better: boolean, label: string): string {
  const { up, down, unit } = TITLE[sport]
  const duration = effortLabel(HEADLINE_DURATION_S)
  const kind = unit === '' ? '' : ` ${unit}`
  return `${better ? up : down} ${duration}${kind} than the ${label.toLowerCase()}`
}

/** A line that names the activity that set the best and its day, when it is among the activities on screen. */
function setOn(words: string, source: ActivitySummary | null): string {
  return source === null
    ? `${words}.`
    : `${words}. Set on ${source.name}, ${formatDayMonth(source.startMs)}.`
}

/**
 * A sport's best 20 minutes against the previous period's, in the figures the page shows. Recorded only when both
 * bests were measured: a ride's watts that were estimated, in either period, say estimated. No range is stated for a
 * best, so it claims neither beyond nor within.
 */
function bestItem(
  sport: Sport,
  input: Pick<ChangesInput, 'result' | 'library' | 'units'> & {
    previous: SportCurves
    label: string
  },
): Compared {
  const { result, previous, library, units, label } = input
  const now = NATIVE[sport](bestOn(result, sport))
  const before = NATIVE[sport](bestOn(previous, sport))
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null
  const gain = SHOWN_GAIN[sport](now, before, units)
  if (gain === 0) return { item: null }
  const source = setBy(CURVE[sport](result), result.activities)
  const earlier = setBy(CURVE[sport](previous), library)
  const words = recordChange(sport, now, before, units, label) ?? ''
  return {
    item: {
      key: `${sport}-best`,
      direction: gain > 0 ? 'up' : 'down',
      title: bestTitle(sport, gain > 0, label),
      body: setOn(`${SHOWN[sport](now, units)}, ${words}`, source),
      tag:
        isEstimatedRecord(sport, source) || isEstimatedRecord(sport, earlier)
          ? 'estimated'
          : 'recorded',
    },
  }
}

/** What the previous period's grades need that its curves do not hold: the library, the profile, the ride's mass. */
export interface PreviousGrading {
  library: readonly ActivitySummary[]
  profile: AgeProfile
  massKg: number
  calibration: HrCalibration | null
}

/**
 * The balance gap the previous period had, from its own best 20 minutes graded the way the page grades this
 * period's: each effort at the age on its day, a ride through its running equivalent at the mass it was
 * ridden at, under the library's calibration. Null when either sport has no graded best then.
 */
export function previousGap(
  result: AnalysisResult,
  previous: SportCurves,
  grading: PreviousGrading,
): BalanceGap | null {
  const watts = bestOn(previous, 'ride')
  if (!Number.isFinite(watts) || !Number.isFinite(bestOn(previous, 'run'))) return null
  const activities = [...grading.library]
  const rideId = previous.rideCurve.find((p) => p.durationS === HEADLINE_DURATION_S)?.activityId
  const rideKg = activityMasses(activities)[rideId ?? ''] ?? grading.massKg
  // The previous period's efforts, graded by the same rule as this period's, from the same shape of result.
  const earlier = {
    ...result,
    activities,
    runCurve: previous.runCurve,
    rideCurve: previous.rideCurve,
    equivalents: [
      {
        durationS: HEADLINE_DURATION_S,
        ridePowerW: watts,
        runSpeed: equivalenceFor(grading.calibration)(watts, rideKg),
      },
    ],
  }
  return gapOfHeadline(headlineGrades(earlier, grading.profile))
}

/** A points figure, signed toward the sport the gap favours: "9 pts toward running". */
function leanWords(gap: BalanceGap): string {
  const size = Math.abs(Math.round(gap.centre))
  return size === 0 ? '0 pts' : `${plural(size, 'pt')} toward ${SPORT_NOUN[favoured(gap.centre)]}`
}

/**
 * The balance's lean against the previous period's. The arrow says whether the lean grew or eased, whichever
 * sport it favours. The 90% ranges of the two periods are compared: not overlapping is beyond its range,
 * overlapping is within it. The range is written from the side the balance leans to, as the headline writes it.
 */
export function leanItem(now: BalanceGap, before: BalanceGap): ChangeItem | null {
  const from = Math.round(before.centre)
  const to = Math.round(now.centre)
  if (from === to) return null
  const verdict = rangeVerdict(before, now)
  const crossed = Math.sign(from) !== Math.sign(to) && from !== 0 && to !== 0
  const grew = Math.abs(to) > Math.abs(from)
  const title = crossed
    ? `Lean moved toward ${SPORT_NOUN[favoured(to)]}`
    : `Lean ${grew ? 'grew' : 'eased'} ${plural(Math.abs(Math.abs(to) - Math.abs(from)), 'pt')}`
  const range = `90% range now ${rangeText(gapReading(now))}`
  const overlap =
    verdict === null
      ? ''
      : `, ${verdict === 'within' ? 'which overlaps' : 'which does not overlap'} the earlier range`
  return {
    key: 'lean',
    direction: grew ? 'up' : 'down',
    title,
    body: `From ${leanWords(before)} to ${leanWords(now)}. ${range}${overlap}.`,
    tag: verdict ?? 'estimated',
  }
}

export interface ChangesInput {
  result: AnalysisResult
  previous: SportCurves | null
  /** Every activity in the library, which dates the efforts the previous period's bests were set in. */
  library: readonly ActivitySummary[]
  /** "Previous 12 weeks"; null when the period has no previous one (all time). */
  previousLabel: string | null
  units: UnitSystem
  /** False while no body weight is entered: a ride's figures wait for it, so its changes do too. */
  rideShown: boolean
  /** This period's balance gap, and what the previous period's grades need; null while the balance waits. */
  gap: BalanceGap | null
  grading: PreviousGrading | null
}

/** What the strip says: what moved, and whether anything could be compared with the previous period at all. */
export interface BalanceChangesResult {
  items: ChangeItem[]
  /** False when the previous period lacks the efforts to compare, which is not the same as nothing moving. */
  compared: boolean
}

/**
 * What moved against the previous period, at most four, the balance first: the lean, then the rides' best
 * 20 minutes, then the runs'. A change is listed only where its figures differ as the page shows them, and only
 * what could be compared is listed. Null when there is no previous period at all, as under All time.
 */
export function balanceChanges(input: ChangesInput): BalanceChangesResult | null {
  const { result, previous, previousLabel, units, rideShown, gap, grading, library } = input
  if (previous === null || previousLabel === null) return null
  const best = { result, previous, library, units, label: previousLabel }
  const leanOutcome = (): Compared => {
    if (gap === null || grading === null) return null
    const before = previousGap(result, previous, grading)
    return before === null ? null : { item: leanItem(gap, before) }
  }
  // The ride's best waits for the weight, so it is named here; the run's best does not.
  const outcomes = [leanOutcome(), rideShown ? bestItem('ride', best) : null, bestItem('run', best)]
  const compared = outcomes.some((outcome) => outcome !== null)
  const items = outcomes.flatMap((outcome) => (outcome?.item ? [outcome.item] : []))
  return { items: items.slice(0, MAX_CHANGES), compared }
}

/** The strip's line when nothing changed: a move within its range is listed as an item, so this means none. */
export function noChangeText(previousLabel: string): string {
  return `Nothing changed since the ${previousLabel.toLowerCase()}.`
}

/** The strip's line when the previous period has activities but not the efforts to compare. */
export function notComparedText(previousLabel: string): string {
  return `Not enough in the ${previousLabel.toLowerCase()} to compare.`
}

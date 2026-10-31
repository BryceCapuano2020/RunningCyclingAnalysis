import type { ChangeEvidence, ChangeVerdict } from '@rca/core/change/types'
import { callAt, directionOf, verdictAt, verdictOfCall } from '@rca/core/change/types'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import { equivalenceFor } from '@rca/core/pipeline'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { HrCalibration, Sport, SportCurves } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatPower } from '@rca/core/units'
import { activityMasses } from '../activityMasses'
import { gapOfHeadline } from '../balanceGap'
import type { BalanceGap } from '../balanceGap'
import { gapReading } from '../components/balanceScale'
import { isPoint, rangeText } from '../components/headlineText'
import { plural } from '../components/plural'
import { formatDayMonth } from '../format/date'
import { HEADLINE_LABEL, headlineGrades } from '../grades'
import type { AgeProfile } from '../grades'
import { effortShare } from '../effortCaveat'
import { NO_CLEAR_CHANGE, recordChange } from '../recordChange'
import { effortLabel, isEstimatedRecord, valueAt } from '../records'
import { SPORT_NOUN, SPORT_ORDER } from '../sports'

/**
 * How a change in the strip is known. Every item is one the change test called: a best that left the band its
 * two periods' efforts make by chance, or a lean that such a best moves. `recorded` is a best measured in both
 * periods, and `estimated` a figure that rests on estimated watts or on a grade, which is itself an estimate.
 */
export type ChangeTag = 'recorded' | 'estimated'

export const TAG_TEXT: Record<ChangeTag, string> = {
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

/**
 * What one comparison gave: null where it could not be made, else its item, or none when the figures are the same.
 * A comparison that was made but not held, because a best was not a hard effort, carries the line that says so.
 */
type Compared = { item: ChangeItem | null; note?: string; unchecked?: string } | null

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
 * The line that says a best was not compared, or null when it can be: neither period's best 20 minutes is known to
 * have been easy. The 90% heart-rate line is the effort gate's own; a best the gate could not judge (no heart rate on it,
 * too few days with one to set a reference) is not held, as the headline is not: nothing shows it was easy, and the
 * headline's note says the effort was not checked.
 */
function notHardNote(
  sport: Sport,
  result: Pick<AnalysisResult, 'effort'>,
  previous: SportCurves,
  label: string,
): string | null {
  const now = effortShare(
    sport,
    result.effort.find((check) => check.durationS === HEADLINE_DURATION_S),
  )
  const before = effortShare(sport, previous.headlineEffort)
  const noun = SPORT_NOUN[sport]
  // Where the reference cannot show an effort hard, a harder effort is not what is missing: say it cannot be called hard.
  if (before !== null && before.checked && !before.hard) {
    return before.confirmed
      ? `No comparable hard ${HEADLINE_LABEL} of ${noun} in the ${label.toLowerCase()}.`
      : `No best ${HEADLINE_LABEL} of ${noun} in the ${label.toLowerCase()} can be called hard, so it is not compared.`
  }
  if (now !== null && now.checked && !now.hard) {
    return now.confirmed
      ? `Your best ${HEADLINE_LABEL} of ${noun} in this period was not a hard effort, so it is not compared.`
      : `Your best ${HEADLINE_LABEL} of ${noun} in this period cannot be called a hard effort, so it is not compared.`
  }
  return null
}

/** The line that says a comparison read every effort, because heart rate could not pick the hard ones of both periods. */
function uncheckedLine(sport: Sport): string {
  return `Effort not checked on the ${SPORT_NOUN[sport]} comparison: too few efforts with heart rate in both periods, so every effort counts.`
}

/**
 * A sport's best 20 minutes against the previous period's, in the figures the page shows. Listed only where the
 * change test calls the move a change; null where the periods hold too few efforts of that length for the test to
 * judge. Recorded only when both bests were measured: a ride's watts that were estimated, in either period, say
 * estimated.
 */
function bestItem(
  sport: Sport,
  input: Pick<ChangesInput, 'result' | 'library' | 'units' | 'change'> & {
    previous: SportCurves
    label: string
  },
): Compared {
  const { result, previous, library, units, label, change } = input
  const now = NATIVE[sport](bestOn(result, sport))
  const before = NATIVE[sport](bestOn(previous, sport))
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null
  // A best set at an easy heart rate is not what the sport can do, so it is not set against one that was.
  const withheld = notHardNote(sport, result, previous, label)
  if (withheld !== null) return { item: null, note: withheld }
  // The strip is a headline, so a best is held to the stricter band.
  const call = callAt(change, sport, HEADLINE_DURATION_S)
  const verdict = verdictOfCall(call, 'headline')
  if (verdict === 'untested') return null
  // Where the periods did not both hold enough efforts with a heart rate, every effort was read in both: say so.
  const unchecked = call?.gated === false ? uncheckedLine(sport) : undefined
  // A move the test does not call is no clear change, so the strip lists nothing, as the curve says nothing.
  if (verdict === 'none') return { item: null, unchecked }
  // Which way it moved is the call's, in the compared unit; the shown figures write the amount.
  const better = directionOf(call, 'headline') > 0
  const words = recordChange(sport, now, before, units, label, call) ?? ''
  if (words === '' || words.startsWith(NO_CLEAR_CHANGE)) return { item: null, unchecked }
  const source = setBy(CURVE[sport](result), result.activities)
  const earlier = setBy(CURVE[sport](previous), library)
  return {
    item: {
      key: `${sport}-best`,
      direction: better ? 'up' : 'down',
      title: bestTitle(sport, better, label),
      body: setOn(`${SHOWN[sport](now, units)}, ${words}`, source),
      tag:
        isEstimatedRecord(sport, source) || isEstimatedRecord(sport, earlier)
          ? 'estimated'
          : 'recorded',
    },
    unchecked,
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

/** Which way a sport's higher best moves the lean: toward running (+1) or toward cycling (-1). */
const FAVOURS: Record<Sport, 1 | -1> = { run: 1, ride: -1 }

/**
 * Whether the change test supports a move of the lean: some sport's best 20 minutes was called a change that moves
 * the lean the way it moved (a higher run best or a lower ride best toward running, and the other two toward
 * cycling). The lean is made of the two bests, so a move that no called best explains is the grades' rounding and
 * the periods' mix of efforts, not a change. A best called the other way does not count for the move; when both are
 * called, and push opposite ways, each way has a best behind it.
 */
function leanSupported(moved: number, verdicts: Record<Sport, ChangeVerdict>): boolean {
  const pushes = SPORT_ORDER.flatMap((sport) => {
    const verdict = verdicts[sport]
    if (verdict !== 'higher' && verdict !== 'lower') return []
    return [FAVOURS[sport] * (verdict === 'higher' ? 1 : -1)]
  })
  return pushes.includes(Math.sign(moved))
}

/**
 * The balance's lean against the previous period's. The arrow says whether the lean grew or eased, whichever
 * sport it favours. It is listed only when a best the change test called explains the move (leanSupported); the
 * range it states is this period's own 90% range, written from the side the balance leans to, as the headline writes it.
 */
export function leanItem(
  now: BalanceGap,
  before: BalanceGap,
  verdicts: Record<Sport, ChangeVerdict>,
): ChangeItem | null {
  const from = Math.round(before.centre)
  const to = Math.round(now.centre)
  if (from === to || !leanSupported(now.centre - before.centre, verdicts)) return null
  const crossed = Math.sign(from) !== Math.sign(to) && from !== 0 && to !== 0
  const grew = Math.abs(to) > Math.abs(from)
  // Two readings both inside the band that counts as level have not moved sides, whichever way each rounds.
  const stillLevel = now.lean === 'even' && before.lean === 'even'
  const title = stillLevel
    ? 'Still in balance'
    : crossed
      ? `Lean moved toward ${SPORT_NOUN[favoured(to)]}`
      : `Lean ${grew ? 'grew' : 'eased'} ${plural(Math.abs(Math.abs(to) - Math.abs(from)), 'pt')}`
  // A range that rounds to one value says nothing the figure does not, so no range is written.
  const reading = gapReading(now)
  const range = isPoint(reading) ? '' : ` 90% range now ${rangeText(reading)}.`
  return {
    key: 'lean',
    direction: grew ? 'up' : 'down',
    title,
    body: `From ${leanWords(before)} to ${leanWords(now)}.${range}`,
    tag: 'estimated',
  }
}

export interface ChangesInput {
  result: AnalysisResult
  previous: SportCurves | null
  /** Every activity in the library, which dates the efforts the previous period's bests were set in. */
  library: readonly ActivitySummary[]
  /** "Previous 12 weeks"; null when the period has no previous one (all time). */
  previousLabel: string | null
  /** Whether each best differs from the previous period's by more than chance; null for all time. */
  change: ChangeEvidence | null
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
  /** Lines for the comparisons that were not made because a best was not a hard effort. */
  notes: string[]
  /** Lines for the comparisons made from every effort, because the periods did not both hold enough efforts with a heart rate. */
  unchecked: string[]
  /** False when the previous period lacks the efforts to compare, which is not the same as nothing moving. */
  compared: boolean
}

/**
 * What moved against the previous period, at most four, the balance first: the lean, then the rides' best
 * 20 minutes, then the runs'. A change is listed only where the change test calls it (and its figures differ as the
 * page shows them), and only what could be compared is listed. Null when there is no previous period at all, as
 * under All time.
 */
export function balanceChanges(input: ChangesInput): BalanceChangesResult | null {
  const { result, previous, previousLabel, units, rideShown, gap, grading, library, change } = input
  if (previous === null || previousLabel === null) return null
  const best = { result, previous, library, units, label: previousLabel, change }
  // A sport whose best was withheld as not a hard effort, or that is held for want of a weight, explains no move of the lean.
  const shown: Record<Sport, boolean> = { run: true, ride: rideShown }
  const verdicts = Object.fromEntries(
    SPORT_ORDER.map((sport) => [
      sport,
      !shown[sport] || notHardNote(sport, result, previous, previousLabel) !== null
        ? 'untested'
        : verdictAt(change, sport, HEADLINE_DURATION_S, 'headline'),
    ]),
  ) as Record<Sport, ChangeVerdict>
  const leanOutcome = (): Compared => {
    if (gap === null || grading === null) return null
    // With neither sport's best judged there is nothing to say a lean moved on.
    if (SPORT_ORDER.every((sport) => verdicts[sport] === 'untested')) return null
    const before = previousGap(result, previous, grading)
    return before === null ? null : { item: leanItem(gap, before, verdicts) }
  }
  // The ride's best waits for the weight, so it is named here; the run's best does not.
  const outcomes = [leanOutcome(), rideShown ? bestItem('ride', best) : null, bestItem('run', best)]
  const compared = outcomes.some((outcome) => outcome !== null)
  const items = outcomes.flatMap((outcome) => (outcome?.item ? [outcome.item] : []))
  const notes = outcomes.flatMap((outcome) => (outcome?.note === undefined ? [] : [outcome.note]))
  const unchecked = outcomes.flatMap((outcome) =>
    outcome?.unchecked === undefined ? [] : [outcome.unchecked],
  )
  return { items: items.slice(0, MAX_CHANGES), notes, unchecked, compared }
}

/** The strip's line when the change test called nothing: the periods were compared, and no best left what chance puts between them. */
export function noChangeText(previousLabel: string): string {
  return `${NO_CLEAR_CHANGE} from the ${previousLabel.toLowerCase()}.`
}

/** The strip's line when the previous period has activities but not the efforts to compare. */
export function notComparedText(previousLabel: string): string {
  return `Not enough in the ${previousLabel.toLowerCase()} to compare.`
}

import { effortsCount } from '@rca/core/digest'
import type { Period } from '@rca/core/period'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL } from '../grades'
import { basisOf, notHardWords, uncheckedWords } from '../effortWords'
import { SPORT_ACTIVITY, SPORT_NOUN, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { hasEvidence, headlineShortfall } from './pickHeadline'

/** The word that says an activity of this sport counts for the headline: the ones that hold a best are outdoor. */
const COUNTED: Record<Sport, string> = { run: 'outdoor', ride: 'outdoor' }

/** A sport's name for an activity, "run" or "outdoor run" where some of its activities do not count, singular or plural. */
function nounOf(activities: ActivitySummary[], sport: Sport, count: number): string {
  const qualified = activities.some((a) => a.sport === sport && !effortsCount(a))
  const [one, many] = [SPORT_ACTIVITY[sport], SPORT_PLURAL[sport]]
  const prefix = qualified ? `${COUNTED[sport]} ` : ''
  return `${prefix}${count === 1 ? one : many}`
}

/** A sport's counted activities as a phrase that matches the need rule: "3 rides", or "3 outdoor runs" where some do not count. */
export function countedPhrase(activities: ActivitySummary[], sport: Sport): string {
  const counted = activities.filter((a) => a.sport === sport && effortsCount(a)).length
  return `${counted} ${nounOf(activities, sport, counted)}`
}

/** What each sport still needs, as phrases such as "2 more rides", and the period it is needed in, or ''. */
function shortfallOf(
  short: Record<Sport, number>,
  period: Period | undefined,
  activities: ActivitySummary[],
): { parts: string[]; inPeriod: string } {
  const parts = SPORT_ORDER.filter((sport) => short[sport] > 0).map(
    (sport) => `${short[sport]} more ${nounOf(activities, sport, short[sport])}`,
  )
  // All time names no period; a dated one is the period on screen.
  return { parts, inPeriod: period === undefined || period.days === null ? '' : ' in this period' }
}

/** The activities each sport still needs in the period, such as "Needs 2 more rides in this period."; null when none. */
export function needLine(
  short: Record<Sport, number>,
  period: Period | undefined,
  activities: ActivitySummary[],
): string | null {
  const { parts, inPeriod } = shortfallOf(short, period, activities)
  return parts.length === 0 ? null : `Needs ${parts.join(' and ')}${inPeriod}.`
}

/** What one sport lacks before the headline can set it against the other, and what to do about it. */
type Need =
  | { kind: 'missing'; sport: Sport }
  | { kind: 'effort'; sport: Sport; reason: string; action: string; reference: boolean }

/** A sport's need, or null: it has the evidence, and its best 20 minutes was not shown to be easy. */
function needOf(result: AnalysisResult, sport: Sport): Need | null {
  if (!hasEvidence(result, sport)) return { kind: 'missing', sport }
  const gate = result.effortGate[sport]
  const activity = SPORT_ACTIVITY[sport]
  if (gate.verdict === 'notHard') {
    const words = notHardWords(sport, gate, 'let them be compared')
    return {
      kind: 'effort',
      sport,
      reference: words.reference,
      reason: words.reference
        ? `Your best ${HEADLINE_LABEL} ${activity} cannot be called hard: ${words.why}.`
        : `Your best ${HEADLINE_LABEL} ${activity} was not a hard effort: ${words.why}.`,
      action: words.reference ? words.action : `a ${HEADLINE_LABEL} ${activity}`,
    }
  }
  // A best that was not checked (no heart rate, too few days) holds nothing: it is shown with a note (`uncheckedNote`).
  return null
}

/**
 * The note that goes beside a comparison that rests on a sport whose best 20 minutes was not checked, because it has no heart
 * rate or too few days with one to set a reference. The comparison is shown, not held: a rider with a power meter and no strap
 * would otherwise never have one. Null when every sport it rests on was checked.
 */
export function uncheckedNote(result: AnalysisResult): string | null {
  const notes = SPORT_ORDER.flatMap((sport) => {
    const gate = result.effortGate[sport]
    const words = gate.verdict === 'unknown' ? uncheckedWords(sport, gate) : null
    return words === null || !hasEvidence(result, sport) ? [] : [`${words.why} ${words.action}`]
  })
  return notes.length === 0 ? null : notes.join(' ')
}

/**
 * The sports whose best 20 minutes was not shown to be a hard effort: heart rate says it was not, or it was not
 * checked (no heart rate on it, too few days with heart rate). A level read from such a best is a floor, not the sport's level.
 */
export function unconfirmedSports(result: AnalysisResult): Sport[] {
  return SPORT_ORDER.filter((sport) => basisOf(result.effortGate[sport]) !== null)
}

/** What each unconfirmed sport's level rests on, for the line under the meter. */
export function levelBasis(result: AnalysisResult): Partial<Record<Sport, string>> {
  return Object.fromEntries(
    unconfirmedSports(result).map((sport) => [sport, basisOf(result.effortGate[sport])]),
  )
}

/** The needs of the sports that have enough activities to be asked for more, in the order the sports sit. */
function needsOf(result: AnalysisResult): Need[] {
  const short = headlineShortfall(result.activities)
  return SPORT_ORDER.filter((sport) => short[sport] === 0).flatMap(
    (sport) => needOf(result, sport) ?? [],
  )
}

/** "a 20 min run reaching 90% of your reference heart rate and one ride of 20 min or more": the activities to add, said once for all the sports. */
function addPhrase(needs: readonly Need[]): string {
  // Sports that only lack a 20 minute effort share the sentence: "one run and one ride of 20 min or more".
  const missing = needs.flatMap((need) => (need.kind === 'missing' ? [need.sport] : []))
  const lacking =
    missing.length === 0
      ? []
      : [
          `${missing.map((sport) => `one ${SPORT_ACTIVITY[sport]}`).join(' and ')} of ${HEADLINE_LABEL} or more`,
        ]
  // Sports whose best was under the line are asked for an effort that reaches it, said once for all of them.
  const efforts = needs.flatMap((need) =>
    need.kind === 'effort' && !need.reference ? [need.action] : [],
  )
  const reaching =
    efforts.length === 0
      ? []
      : [
          `${efforts.join(' and ')}${efforts.length > 1 ? ', each' : ''} reaching 90% of your reference heart rate`,
        ]
  return [...reaching, ...lacking].join(' and ')
}

/** The sentence that says what to add, then the sentences that say how to set a reference that cannot be trusted. */
function actionOf(needs: readonly Need[]): string {
  const add = addPhrase(needs)
  const references = needs.flatMap((need) =>
    need.kind !== 'missing' && need.reference ? [need.action] : [],
  )
  return [add === '' ? '' : `Add ${add} to compare them.`, ...references]
    .filter((x) => x !== '')
    .join(' ')
}

/** What the hold for effort says: the sports it is for, why, and what lifts it. */
export interface EffortHold {
  sports: Sport[]
  text: string
  action: string
}

/**
 * The hold on the headline for effort, or null when there is none: a sport with the activities for it whose best
 * 20 minutes was not shown to be a hard effort, or was not checked at all (no heart rate on it, or too few days with
 * heart rate to set a reference). A hold, not a change to the rule that reads the gap once both sports are there.
 */
export function effortHold(result: AnalysisResult): EffortHold | null {
  const needs = needsOf(result).filter(
    (need): need is Exclude<Need, { kind: 'missing' }> => need.kind !== 'missing',
  )
  if (needs.length === 0) return null
  return {
    sports: needs.map((need) => need.sport),
    text: needs.map((need) => need.reason).join(' '),
    action: actionOf(needs),
  }
}

/**
 * What to do to lift the hold, as one action: add the activities a sport is short of ("Add 2 more rides in
 * this period to compare them."), or what each sport lacks: a run or ride of the headline's length, a hard effort of
 * it where heart rate shows the best 20 minutes was not one, or a heart rate where none was checked. The same facts as
 * heldReason, said as an instruction.
 */
export function heldAction(result: AnalysisResult, period: Period | undefined): string {
  const { parts, inPeriod } = shortfallOf(
    headlineShortfall(result.activities),
    period,
    result.activities,
  )
  if (parts.length > 0) return `Add ${parts.join(' and ')}${inPeriod} to compare them.`
  const needs = needsOf(result)
  return needs.length === 0
    ? `Add one run or ride of ${HEADLINE_LABEL} or more to compare them.`
    : actionOf(needs)
}

/**
 * Why the headline is held, as the sentence that says what is missing: too few activities in the period, no
 * effort of the headline's length in a sport, a best 20 minutes that was not hard, or one that was not checked.
 * The activities come first, since an effort cannot be asked of a sport with too little on file.
 */
export function heldReason(result: AnalysisResult, period: Period | undefined): string {
  const short = needLine(headlineShortfall(result.activities), period, result.activities)
  if (short !== null) return short
  const needs = needsOf(result)
  if (needs.length === 0) return NEEDS_EFFORT
  const missing = needs.flatMap((need) => (need.kind === 'missing' ? [SPORT_NOUN[need.sport]] : []))
  const lacking =
    missing.length === 0
      ? []
      : [
          `Your ${missing.join(' and ')} ${missing.length === 1 ? 'has' : 'have'} no ${HEADLINE_LABEL} effort yet.`,
        ]
  return [
    ...lacking,
    ...needs.flatMap((need) => (need.kind === 'missing' ? [] : [need.reason])),
  ].join(' ')
}

/** The reason when nothing in particular is known to be missing: a hard effort of the headline's length would help. */
const NEEDS_EFFORT = `A hard ${HEADLINE_LABEL} run or ride would let them be compared.`

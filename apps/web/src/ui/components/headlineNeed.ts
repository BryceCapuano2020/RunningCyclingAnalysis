import { MIN_CLIMB_GRADE } from '@rca/core/constants'
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
function addPhrase(needs: readonly Need[], activities: ActivitySummary[]): string {
  // Sports that only lack a 20 minute effort share the sentence: "one run and one ride of 20 min or more".
  const missing = needs.flatMap((need) => (need.kind === 'missing' ? [need.sport] : []))
  const plain = missing.filter((sport) => meterFacts(activities, sport) === null)
  const climbs = missing.filter((sport) => meterFacts(activities, sport) !== null)
  const lacking = [
    ...(plain.length === 0
      ? []
      : [
          `${plain.map((sport) => `one ${SPORT_ACTIVITY[sport]}`).join(' and ')} of ${HEADLINE_LABEL} or more`,
        ]),
    // A ride known by the model's watts is asked for a power meter, or a climb that holds for the headline's length.
    ...climbs.map(
      (sport) =>
        `one ${SPORT_ACTIVITY[sport]} of ${HEADLINE_LABEL} or more with a power meter, or with ${CLIMB_NEEDED}`,
    ),
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
function actionOf(needs: readonly Need[], activities: ActivitySummary[]): string {
  const add = addPhrase(needs, activities)
  // Where a ride has no altitude to find a climb from, that is said first.
  const flat = needs.find(
    (need) => need.kind === 'missing' && meterFacts(activities, need.sport)?.noAltitude === true,
  )
  const lead =
    flat === undefined
      ? ''
      : `None of your ${SPORT_PLURAL[flat.sport]} without a power meter records altitude, so no climb can be found. `
  const references = needs.flatMap((need) =>
    need.kind !== 'missing' && need.reference ? [need.action] : [],
  )
  const body = [add === '' ? '' : `Add ${add} to compare them.`, ...references]
    .filter((x) => x !== '')
    .join(' ')
  return `${lead}${body}`
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
    action: actionOf(needs, result.activities),
  }
}

/**
 * What a ride without a power meter needs for the headline: virtual power is trusted only on a climb, and
 * the headline's length needs one that holds that long without a break. A long ride is not enough, and
 * neither is a hilly one whose climbs are shorter.
 */
export const CLIMB_NEEDED = `a climb of ${Math.round(MIN_CLIMB_GRADE * 100)}% or steeper that holds for ${HEADLINE_LABEL} without a break`

/** The sports whose activities may or may not have a power meter, and so may be known only by the model's watts. */
const MAY_LACK_METER: Record<Sport, boolean> = { run: false, ride: true }

/**
 * What a sport's counted activities say about a power meter, and about the altitude a climb is found from. Some
 * are the model's watts, or there would be no facts: only a climb can give those a best of the headline's length.
 */
interface MeterFacts {
  /** All are: none has a meter, so a longer one cannot help. */
  allVirtual: boolean
  /** Those with the model's watts were all flagged as recording no altitude, so no climb can be found in them. */
  noAltitude: boolean
}

/** The meter facts of the activities of a sport that the headline's rule counts, or null for a sport with no meter. */
function meterFacts(activities: ActivitySummary[], sport: Sport): MeterFacts | null {
  if (!MAY_LACK_METER[sport]) return null
  const counted = activities.filter((a) => a.sport === sport && effortsCount(a))
  const virtual = counted.filter((a) => a.powerSource === 'virtual')
  if (virtual.length === 0) return null
  return {
    allVirtual: virtual.length === counted.length,
    noAltitude: virtual.every((a) => (a.flagCounts['missing-altitude'] ?? 0) > 0),
  }
}

/** Why a sport with the model's watts has no best of the headline's length, and what it compares on instead. */
function climbReason(sport: Sport, fact: MeterFacts): string {
  const [plural, one] = [SPORT_PLURAL[sport], SPORT_ACTIVITY[sport]]
  if (fact.noAltitude) {
    return `None of your ${plural} without a power meter records altitude, so a ${one} without one has no climb to compare on.`
  }
  if (fact.allVirtual) {
    return `Your ${plural} have no power meter, so a ${one} compares only on ${CLIMB_NEEDED}.`
  }
  return `None of your ${plural} with a power meter has a best of ${HEADLINE_LABEL}, and those without one compare only on ${CLIMB_NEEDED}.`
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
    : actionOf(needs, result.activities)
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
  const meter = (sport: Sport) => meterFacts(result.activities, sport)
  const missing = needs.flatMap((need) => (need.kind === 'missing' ? [need.sport] : []))
  // A ride known by the model's watts is short of a climb as well as of length, which a longer ride alone does not mend.
  const plain = missing.filter((sport) => meter(sport) === null).map((sport) => SPORT_NOUN[sport])
  const lacking =
    plain.length === 0
      ? []
      : [
          `Your ${plain.join(' and ')} ${plain.length === 1 ? 'has' : 'have'} no ${HEADLINE_LABEL} effort yet.`,
        ]
  const climbs = missing.flatMap((sport) => {
    const fact = meter(sport)
    return fact === null ? [] : [climbReason(sport, fact)]
  })
  return [
    ...lacking,
    ...climbs,
    ...needs.flatMap((need) => (need.kind === 'missing' ? [] : [need.reason])),
  ].join(' ')
}

/** The reason when nothing in particular is known to be missing: a hard effort of the headline's length would help. */
const NEEDS_EFFORT = `A hard ${HEADLINE_LABEL} run or ride would let them be compared.`

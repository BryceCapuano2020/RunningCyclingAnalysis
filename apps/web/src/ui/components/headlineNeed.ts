import { MIN_CLIMB_GRADE } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { Period } from '@rca/core/period'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL } from '../grades'
import { uncheckedWords } from '../effortWords'
import { BALANCE_PAIR, SPORT_ACTIVITY, SPORT_NOUN, SPORT_PLURAL } from '../sports'
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
  const parts = BALANCE_PAIR.filter((sport) => short[sport] > 0).map(
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

/** The sports with the activities for it that have no effort as long as the headline's, in the order the sports sit. */
function lackingSports(result: AnalysisResult): Sport[] {
  const short = headlineShortfall(result.activities)
  return BALANCE_PAIR.filter((sport) => short[sport] === 0 && !hasEvidence(result, sport))
}

/**
 * The note that goes beside a comparison that rests on a sport whose best 20 minutes was not checked, because it has no heart
 * rate or too few days with one to set a reference. The comparison is shown, not held: a rider with a power meter and no strap
 * would otherwise never have one. Null when every sport it rests on was checked.
 */
export function uncheckedNote(result: AnalysisResult): string | null {
  const notes = BALANCE_PAIR.flatMap((sport) => {
    const gate = result.effortGate[sport]
    const words = gate.verdict === 'unknown' ? uncheckedWords(sport, gate) : null
    return words === null || !hasEvidence(result, sport) ? [] : [`${words.why} ${words.action}`]
  })
  // Sports that lack the same thing share a line, so a library with too few days with heart rate says it once.
  return notes.length === 0 ? null : [...new Set(notes)].join(' ')
}

/** "one run and one ride of 20 min or more": the activities to add, said once for all the sports. */
function addPhrase(missing: readonly Sport[], activities: ActivitySummary[]): string {
  // Sports that only lack a 20 minute effort share the sentence: "one run and one ride of 20 min or more".
  const plain = missing.filter((sport) => meterFacts(activities, sport) === null)
  const climbs = missing.filter((sport) => meterFacts(activities, sport) !== null)
  return [
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
  ].join(' and ')
}

/** The sentence that says what to add to compare the sports. */
function actionOf(missing: readonly Sport[], activities: ActivitySummary[]): string {
  // Where a ride has no altitude to find a climb from, that is said first.
  const flat = missing.find((sport) => meterFacts(activities, sport)?.noAltitude === true)
  const lead =
    flat === undefined
      ? ''
      : `None of your ${SPORT_PLURAL[flat]} without a power meter records altitude, so no climb can be found. `
  return `${lead}Add ${addPhrase(missing, activities)} to compare them.`
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
 * this period to compare them."), or the run or ride of the headline's length a sport lacks. The same facts as
 * heldReason, said as an instruction.
 */
export function heldAction(result: AnalysisResult, period: Period | undefined): string {
  const { parts, inPeriod } = shortfallOf(
    headlineShortfall(result.activities),
    period,
    result.activities,
  )
  if (parts.length > 0) return `Add ${parts.join(' and ')}${inPeriod} to compare them.`
  const missing = lackingSports(result)
  return missing.length === 0 ? NEEDS_LENGTH : actionOf(missing, result.activities)
}

/**
 * Why the headline is held, as the sentence that says what is missing: too few activities in the period, or no
 * effort of the headline's length in a sport. The activities come first, since an effort cannot be asked of a
 * sport with too little on file.
 */
export function heldReason(result: AnalysisResult, period: Period | undefined): string {
  const short = needLine(headlineShortfall(result.activities), period, result.activities)
  if (short !== null) return short
  const missing = lackingSports(result)
  if (missing.length === 0) return NEEDS_LENGTH
  const meter = (sport: Sport) => meterFacts(result.activities, sport)
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
  return [...lacking, ...climbs].join(' ')
}

/** The line when nothing in particular is known to be missing: a run or ride of the headline's length would help. */
const NEEDS_LENGTH = `Add one run or ride of ${HEADLINE_LABEL} or more to compare them.`

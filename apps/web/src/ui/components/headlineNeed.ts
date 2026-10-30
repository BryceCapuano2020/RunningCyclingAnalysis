import { MIN_CLIMB_GRADE } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { Period } from '@rca/core/period'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_ACTIVITY, SPORT_ORDER, SPORT_PLURAL } from '../sports'
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

/** What a sport lacking an effort of the headline's length needs. */
const NEEDS_EFFORT = `A hard ${HEADLINE_LABEL} run or ride would let them be compared.`

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

/**
 * What to do to lift the hold, as one action: add the activities a sport is short of ("Add 2 more rides in
 * this period to compare them."), or else one run or ride of the headline's length. The same facts as
 * heldReason, said as an instruction. It does not say "hard": the evidence rule (hasEvidence) asks for a best
 * of at least the headline's length, which any activity that long gives however easy, or a fitted threshold.
 */
export function heldAction(result: AnalysisResult, period: Period | undefined): string {
  const { parts, inPeriod } = shortfallOf(
    headlineShortfall(result.activities),
    period,
    result.activities,
  )
  if (parts.length > 0) return `Add ${parts.join(' and ')}${inPeriod} to compare them.`
  const lacking = SPORT_ORDER.filter((sport) => !hasEvidence(result, sport))
  // A sport known by the model's watts is short of a climb as well as of length: say that, since adding a long
  // ride alone will not help. Without any altitude there is no climb to find, which is said first.
  const facts = new Map(lacking.map((sport) => [sport, meterFacts(result.activities, sport)]))
  if ([...facts.values()].some((fact) => fact !== null)) {
    const asks = lacking.map((sport) =>
      facts.get(sport) === null
        ? `one ${SPORT_ACTIVITY[sport]} of ${HEADLINE_LABEL} or more`
        : `one ${SPORT_ACTIVITY[sport]} of ${HEADLINE_LABEL} or more with a power meter, or with ${CLIMB_NEEDED}`,
    )
    const flat = lacking.find((sport) => facts.get(sport)?.noAltitude)
    const lead =
      flat === undefined
        ? ''
        : `None of your ${SPORT_PLURAL[flat]} without a power meter records altitude, so no climb can be found. `
    return `${lead}Add ${asks.join(' and ')} to compare them.`
  }
  const one = lacking.map((sport) => `one ${SPORT_ACTIVITY[sport]}`).join(' and ')
  return lacking.length === 0
    ? `Add one run or ride of ${HEADLINE_LABEL} or more to compare them.`
    : `Add ${one} of ${HEADLINE_LABEL} or more to compare them.`
}

/**
 * Why the headline is held, as the sentence that says what is missing: too few activities in the period, or no
 * effort of the headline's length in a sport. The activities come first, since an effort cannot be asked of a
 * sport with too little on file. For a headline that is held; one with enough of both says the effort.
 */
export function heldReason(result: AnalysisResult, period: Period | undefined): string {
  const short = needLine(headlineShortfall(result.activities), period, result.activities)
  if (short !== null) return short
  for (const sport of SPORT_ORDER.filter((candidate) => !hasEvidence(result, candidate))) {
    const fact = meterFacts(result.activities, sport)
    if (fact === null) continue
    const [plural, one] = [SPORT_PLURAL[sport], SPORT_ACTIVITY[sport]]
    if (fact.noAltitude) {
      return `None of your ${plural} without a power meter records altitude, so a ${one} without one has no climb to compare on.`
    }
    if (fact.allVirtual) {
      return `Your ${plural} have no power meter, so a ${one} compares only on ${CLIMB_NEEDED}.`
    }
    return `None of your ${plural} with a power meter has a best of ${HEADLINE_LABEL}, and those without one compare only on ${CLIMB_NEEDED}.`
  }
  return NEEDS_EFFORT
}

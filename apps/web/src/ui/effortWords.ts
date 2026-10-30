import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { SPORT_ACTIVITY, SPORT_NOUN } from './sports'

/*
 * What to say when the effort gate does not show a best was hard, and what would change it. The two cases differ in
 * what is missing, so they differ in what to do: a reference that can be trusted and a best under it asks for a harder
 * effort; a reference that cannot be trusted (low, habitual, high) is not fixed by a harder effort the athlete cannot
 * know would count, and asks for the reference to be set or earned. One place says each, so no surface promises a fix
 * that is not one.
 */

/** The effort every gate judges, in the words an effort is named in: "20 min". */
export const EFFORT_TEXT = formatDuration(HEADLINE_DURATION_S)

/** What to do about a reference that cannot certify an effort: enter the maximum, or earn it on several hard days. */
export const REFERENCE_ACTION =
  'Set your max heart rate in Profile, or reach hard heart rates on several days.'

/** What to do about a reference far above the age band: confirm it by entering it. */
export const HIGH_ACTION = 'If it is right, enter it as your max heart rate in Profile.'

/** Why a library with too few days with heart rate was not checked, and what would let it be. */
export const THIN_WHY = 'Effort not checked: too few days with heart rate.'
export const THIN_ACTION =
  'Add your year of birth or max heart rate in Profile, or record more days with heart rate.'

/** What a gate that did not show an effort hard says: why, and what would change it. */
export interface EffortWords {
  /** Why, as a clause that follows "Your best 20 min": "reached 82% of your running reference heart rate". */
  why: string
  /** What would change it, as a sentence. `settles` finishes "A hard 20 min effort would …" when a harder effort is the answer. */
  action: string
  /** Whether a harder effort would change it, or the reference has to be set or earned first. */
  reference: boolean
}

function bpmText(bpm: number | null): string {
  return bpm === null ? '' : `, ${Math.round(bpm)} bpm,`
}

/**
 * Why a best 20 minutes the gate judged `notHard` was not shown hard, and what to do. `settles` is what a hard effort
 * would do ("give a threshold", "let them be compared"), used where the reference can certify one.
 */
export function notHardWords(sport: Sport, gate: EffortGate, settles: string): EffortWords {
  const noun = SPORT_NOUN[sport]
  const supplier = gate.referenceFrom !== null ? SPORT_NOUN[gate.referenceFrom] : noun
  const derived = gate.referenceFrom !== null && gate.referenceFrom !== sport
  switch (gate.reference) {
    case 'low':
      return {
        why: derived
          ? `the highest heart rate on file for your ${supplier}, which your ${noun} reference is worked out from, is too low to be a maximum`
          : `the highest ${noun} heart rate on file${bpmText(gate.referenceBpm)} is too low to be a maximum`,
        action: REFERENCE_ACTION,
        reference: true,
      }
    case 'habitual':
      return {
        why: `your ${supplier} heart rate on file never rises far above a typical day's, so it does not look like a maximum`,
        action: REFERENCE_ACTION,
        reference: true,
      }
    case 'high':
      return {
        why: `your highest ${supplier} heart rate on file${bpmText(gate.referenceBpm)} is far above the usual maximum for your age, so it may not be a maximum`,
        action: HIGH_ACTION,
        reference: true,
      }
    default:
      return {
        why: `it reached ${Math.round((gate.share ?? 0) * 100)}% of your ${noun} reference heart rate`,
        action: `A hard ${EFFORT_TEXT} effort would ${settles}.`,
        reference: false,
      }
  }
}

/**
 * Why a gate could not judge, and what would let it: the effort was not checked. `add` is what to add as a phrase that
 * follows "Add" where an activity mends it (no heart rate), and null where only the reference does (too few days).
 */
export function uncheckedWords(
  sport: Sport,
  gate: EffortGate,
): { why: string; action: string; add: string | null } | null {
  switch (gate.unchecked) {
    case 'noHeartRate':
      return {
        why: `Effort not checked: no heart rate on your best ${EFFORT_TEXT} ${SPORT_ACTIVITY[sport]}.`,
        action: `Add a ${SPORT_ACTIVITY[sport]} with heart rate to check it.`,
        add: `a ${SPORT_ACTIVITY[sport]} with heart rate`,
      }
    case 'thin':
      return { why: THIN_WHY, action: THIN_ACTION, add: null }
    default:
      return null
  }
}

/**
 * What a level read from a sport's best 20 minutes rests on, when that best was not shown to be a hard effort; null when
 * it was, or when the gate has nothing to say (no 20 minute best).
 */
export function basisOf(gate: EffortGate): string | null {
  const base = `best ${EFFORT_TEXT}`
  if (gate.verdict === 'notHard') {
    return gate.reference === 'trusted'
      ? `${base}, not a hard effort`
      : `${base}, effort not confirmed`
  }
  return gate.verdict === 'unknown' &&
    (gate.unchecked === 'noHeartRate' || gate.unchecked === 'thin')
    ? `${base}, effort not checked`
    : null
}

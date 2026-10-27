import { EQUIVALENCE_DURATIONS_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { balanceGap } from './balanceGap'
import type { Lean } from '../domain/lean'
import { sportGrade } from './grades'
import type { AgeProfile, SportGrade } from './grades'
import { effortLabel } from './records'
import { SPORT_NOUN, SPORT_ORDER } from './sports'

/**
 * The durations a grade is drawn at, 3 to 60 min. A ride is graded through its running equivalent,
 * and that is worked out at exactly these lengths, so they are the lengths both sports can be graded at.
 */
export const PROFILE_DURATIONS_S: readonly number[] = EQUIVALENCE_DURATIONS_S

/** A sport's age grade at one duration: a run is a point, and a ride carries its range. */
export interface ProfilePoint {
  durationS: number
  grade: SportGrade
}

/** Each sport's graded points, shortest duration first. A duration with no grade has no point. */
export type GradeProfile = Record<Sport, ProfilePoint[]>

/**
 * Each sport's age grade at every duration from 3 to 60 min that its best-effort curve and the age
 * standards grade. A duration without a best, or without a standard, is left out, never filled in.
 */
export function gradeProfile(result: AnalysisResult, profile: AgeProfile): GradeProfile {
  const pointsOf = (sport: Sport): ProfilePoint[] =>
    PROFILE_DURATIONS_S.flatMap((durationS) => {
      const outcome = sportGrade(result, sport, durationS, profile)
      return outcome.kind === 'graded' ? [{ durationS, grade: outcome.grade }] : []
    })
  return Object.fromEntries(SPORT_ORDER.map((sport) => [sport, pointsOf(sport)])) as GradeProfile
}

/** A duration with both sports graded, and which way the two grades lean there. */
interface Pairing {
  durationS: number
  lean: Lean
}

/**
 * The durations both sports are graded at, each with its lean. A sport leads only when its grade is
 * outside the other's range, in whole percents: the rule the balance uses.
 */
function pairingsOf(profile: GradeProfile): Pairing[] {
  const [first, second] = SPORT_ORDER
  return profile[first].flatMap((point) => {
    const other = profile[second].find((candidate) => candidate.durationS === point.durationS)
    return other === undefined
      ? []
      : [{ durationS: point.durationS, lean: balanceGap(point.grade, other.grade).lean }]
  })
}

/** The durations, in seconds, at which both sports are graded. */
export function profileDurations(profile: GradeProfile): number[] {
  return pairingsOf(profile).map((pairing) => pairing.durationS)
}

/** A run of neighbouring durations with the same lean. */
interface Stretch {
  lean: Lean
  fromS: number
  toS: number
}

function stretchesOf(pairings: readonly Pairing[]): Stretch[] {
  const stretches: Stretch[] = []
  for (const { durationS, lean } of pairings) {
    const last = stretches.at(-1)
    if (last !== undefined && last.lean === lean) last.toS = durationS
    else stretches.push({ lean, fromS: durationS, toS: durationS })
  }
  return stretches
}

/** Where a stretch of durations is, in words: up to its end, from its start on, at one, or between two. */
function whereText(stretch: Pick<Stretch, 'fromS' | 'toS'>, firstS: number, lastS: number): string {
  if (stretch.fromS === firstS) return `up to ${effortLabel(stretch.toS)}`
  if (stretch.toS === lastS) return `from ${effortLabel(stretch.fromS)} on`
  if (stretch.fromS === stretch.toS) return `at ${effortLabel(stretch.fromS)}`
  return `from ${stretch.fromS / 60} to ${effortLabel(stretch.toS)}`
}

const WITHIN_RANGE = `Your ${SPORT_NOUN[SPORT_ORDER[0]]} and ${SPORT_NOUN[SPORT_ORDER[1]]} grade within range of each other at every duration.`

/** Said after a lead that holds for only some of the durations, so the rest is not left unsaid. */
const ELSEWHERE_EVEN = 'The two grade within range of each other at the other durations.'

/** The sport that is not this one, among the two the page compares. */
function otherThan(sport: Sport): Sport {
  return SPORT_ORDER[0] === sport ? SPORT_ORDER[1] : SPORT_ORDER[0]
}

/** A stretch of durations where one sport leads. */
interface Leading {
  sport: Sport
  fromS: number
  toS: number
}

/** The stretches where a sport leads. Where the sports are even there is no lead to name. */
function leadingOf(stretches: readonly Stretch[]): Leading[] {
  return stretches.flatMap(({ lean, fromS, toS }) =>
    lean === 'even' ? [] : [{ sport: lean, fromS, toS }],
  )
}

/**
 * The sentence for the sports' leads, with a sport's neighbouring leads said together. One sport leading
 * names the other; a lead that changes hands walks through each, such as "Your cycling grades higher up to
 * 5 min, your running from 10 min on."
 */
function leadsText(leads: readonly Leading[], firstS: number, lastS: number): string {
  const holders: { sport: Sport; where: string[] }[] = []
  for (const lead of leads) {
    const where = whereText(lead, firstS, lastS)
    const last = holders.at(-1)
    if (last !== undefined && last.sport === lead.sport) last.where.push(where)
    else holders.push({ sport: lead.sport, where: [where] })
  }
  const [head, ...rest] = holders
  if (head === undefined) return WITHIN_RANGE
  const wherever = (holder: { where: string[] }) => holder.where.join(' and ')
  if (rest.length === 0) {
    const [lead, other] = [SPORT_NOUN[head.sport], SPORT_NOUN[otherThan(head.sport)]]
    return `Your ${lead} grades higher than your ${other} ${wherever(head)}.`
  }
  const parts = [
    `Your ${SPORT_NOUN[head.sport]} grades higher ${wherever(head)}`,
    ...rest.map((holder) => `your ${SPORT_NOUN[holder.sport]} ${wherever(holder)}`),
  ]
  return `${parts.join(', ')}.`
}

/**
 * One plain sentence on how the sports compare across durations, or null when fewer than two durations
 * are graded in both, which is too few to say anything the balance at 20 min does not.
 */
export function profileFinding(profile: GradeProfile): string | null {
  const pairings = pairingsOf(profile)
  const firstS = pairings[0]?.durationS
  const lastS = pairings.at(-1)?.durationS
  if (pairings.length < 2 || firstS === undefined || lastS === undefined) return null
  const stretches = stretchesOf(pairings)
  const [only] = stretches
  if (only !== undefined && stretches.length === 1) {
    if (only.lean === 'even') return WITHIN_RANGE
    const [lead, other] = [SPORT_NOUN[only.lean], SPORT_NOUN[otherThan(only.lean)]]
    return `Your ${lead} grades higher than your ${other} at every duration from ${firstS / 60} to ${effortLabel(lastS)}.`
  }
  const leads = leadsText(leadingOf(stretches), firstS, lastS)
  return stretches.some((stretch) => stretch.lean === 'even') ? `${leads} ${ELSEWHERE_EVEN}` : leads
}

import { PROFILE_DURATIONS_S } from '@rca/core/constants'
import { profileEquivalents } from '@rca/core/pipeline'
import type { AnalysisResult } from '@rca/core/pipeline'
import { HOUR_S } from '@rca/core/threshold'
import type { Sport } from '@rca/core/types'
import { leanOfRange } from '../domain/lean'
import type { Lean as BalanceLean } from '../domain/lean'
import { balanceGap } from './balanceGap'
import { sportGrade } from './grades'
import type { AgeProfile, SportGrade } from './grades'
import { effortLabel } from './records'
import { BALANCE_PAIR, SPORT_NOUN, SPORT_ORDER, SPORT_TITLE } from './sports'

/** A sport's age grade at one duration: a run is a point, and a ride carries its range. */
export interface ProfilePoint {
  durationS: number
  grade: SportGrade
}

/** Each sport's graded points, shortest duration first. A duration with no grade has no point. */
export type GradeProfile = Record<Sport, ProfilePoint[]>

/**
 * Each sport's age grade at every duration from 3 min to 3 h that its best-effort curve and the age
 * standards grade. A duration without a best, or without a standard, is left out, never filled in. The
 * ride's equivalents beyond the result's own are priced at massKg, the body mass the result was made for.
 */
export function gradeProfile(
  result: AnalysisResult,
  profile: AgeProfile,
  massKg: number,
): GradeProfile {
  const priced = {
    ...result,
    equivalents: [...result.equivalents, ...profileEquivalents(result, massKg, profile.sex)],
  }
  const pointsOf = (sport: Sport): ProfilePoint[] =>
    PROFILE_DURATIONS_S.flatMap((durationS) => {
      const outcome = sportGrade(priced, sport, durationS, profile)
      return outcome.kind === 'graded' ? [{ durationS, grade: outcome.grade }] : []
    })
  return Object.fromEntries(SPORT_ORDER.map((sport) => [sport, pointsOf(sport)])) as GradeProfile
}

/** A duration with both sports graded: the gap between their centre grades, and which way the range alone reads it. */
export interface Lean {
  durationS: number
  /** The first sport's centre grade less the second's, in whole points, as the balance takes it. */
  gap: number
  /** A sport leads only where its grade is outside the other's range, in whole percents; else the two are even. */
  lean: Sport | 'even'
}

/**
 * The durations both sports are graded at, each with its gap and lean. They come from the grades the
 * headline uses, through the balance's own `balanceGap`, so the gap at 20 min is the headline's. The
 * lean here is by the range alone (`leanOfRange`): a sport leads where its grade is outside the other's range.
 */
export function profileLeans(profile: GradeProfile): Lean[] {
  const [first, second] = BALANCE_PAIR
  return profile[first].flatMap((point) => {
    const other = profile[second].find((candidate) => candidate.durationS === point.durationS)
    if (other === undefined) return []
    const gap = balanceGap(point.grade, other.grade)
    return [{ durationS: point.durationS, gap: gap.centre, lean: leanOfRange(gap) }]
  })
}

/** The durations, in seconds, at which both sports are graded. */
export function profileDurations(profile: GradeProfile): number[] {
  return profileLeans(profile).map((pairing) => pairing.durationS)
}

/** Whether any shared duration has one sport outside the other's range, so that the chart has a gap to show. */
export function profileSeparated(profile: GradeProfile): boolean {
  return profileLeans(profile).some((pairing) => pairing.lean !== 'even')
}

/**
 * Durations over which one sport leads, from the first to the last of them. Durations where the two are
 * even between them are not a break, since a grade at the edge of a range flips with a rounding; they are
 * listed in `apart`, and `led` counts the durations the sport leads at.
 */
interface Stretch {
  sport: Sport
  fromS: number
  toS: number
  apart: number[]
  led: number
}

/** The stretches where each sport leads, merging a sport's leads that only even durations separate. */
function stretchesOf(pairings: readonly Lean[]): Stretch[] {
  const stretches: Stretch[] = []
  let even: number[] = []
  for (const { durationS, lean } of pairings) {
    if (lean === 'even') {
      even.push(durationS)
      continue
    }
    const last = stretches.at(-1)
    if (last !== undefined && last.sport === lean) {
      last.apart.push(...even)
      last.toS = durationS
      last.led += 1
    } else stretches.push({ sport: lean, fromS: durationS, toS: durationS, apart: [], led: 1 })
    even = []
  }
  return stretches
}

/**
 * The stretches a finding may name: one that a sport leads at two durations or more. A lead at one duration
 * is noise, since a grade at the edge of a range flips with a rounding, so it is not named and does not break
 * the stretch around it: the sport's stretches either side of it are one.
 */
function namedStretches(pairings: readonly Lean[]): Stretch[] {
  const merged: Stretch[] = []
  for (const stretch of stretchesOf(pairings).filter((each) => each.led >= 2)) {
    const last = merged.at(-1)
    if (last !== undefined && last.sport === stretch.sport) {
      // What lay between the two, a dropped lead of the other sport or a duration within range, is an exception.
      const between = pairings
        .map((pairing) => pairing.durationS)
        .filter((durationS) => durationS > last.toS && durationS < stretch.fromS)
      last.apart.push(...between, ...stretch.apart)
      last.toS = stretch.toS
      last.led += stretch.led
    } else merged.push({ ...stretch })
  }
  return merged
}

/** Where a stretch is, in words: the whole range of durations, or its first to its last: "15 to 45 min". */
function whereText(stretch: Stretch, firstS: number, lastS: number): string {
  const { fromS, toS, apart } = stretch
  if (fromS === firstS && toS === lastS) return apart.length === 0 ? 'every length' : 'most lengths'
  return `${fromS / 60} to ${effortLabel(toS)}`
}

/** A sport's name as the subject of a title: "Running", "Cycling". */
function subject(sport: Sport): string {
  return SPORT_TITLE[sport]
}

/** What the profile says: its clause, the sports it calls higher, and what it says of the headline length. */
interface ProfileClaim {
  text: string
  /** The sports it names as higher at some length, in the order it names them; none when it says they grade alike. */
  higher: Sport[]
  /** The sport it calls higher at the hero's length; null when it names no stretch there, or says they grade alike. */
  atHeadline: Sport | null
}

/**
 * The length the hero grades: its threshold is an hour (`sportStanding`), so the profile's claim is checked against the hero at the
 * hour, and a stretch that calls the other sport higher there is the one that would contradict it.
 */
const HERO_DURATION_S = HOUR_S

/** The sport a named stretch calls higher at the hero's length, or null when that length is outside it or an exception in it. */
function higherAtHeadline(stretches: readonly Stretch[]): Sport | null {
  const holds = stretches.find(
    ({ fromS, toS, apart }) =>
      fromS <= HERO_DURATION_S && HERO_DURATION_S <= toS && !apart.includes(HERO_DURATION_S),
  )
  return holds?.sport ?? null
}

/** The clause `profileFinding` words and what it claims, or null with fewer than two durations graded in both sports. */
function claimOf(profile: GradeProfile): ProfileClaim | null {
  const pairings = profileLeans(profile)
  const firstS = pairings[0]?.durationS
  const lastS = pairings.at(-1)?.durationS
  if (pairings.length < 2 || firstS === undefined || lastS === undefined) return null
  const named = namedStretches(pairings)
  const [first, ...rest] = named
  if (first === undefined) {
    const anyLead = pairings.some((pairing) => pairing.lean !== 'even')
    const [one, other] = BALANCE_PAIR
    return {
      text: `${SPORT_TITLE[one]} and ${SPORT_NOUN[other]} grade alike${anyLead ? ' at most lengths' : ''}`,
      higher: [],
      atHeadline: null,
    }
  }
  const later = rest.map(
    (stretch) => `${SPORT_NOUN[stretch.sport]} at ${whereText(stretch, firstS, lastS)}`,
  )
  const lead = `${subject(first.sport)} grades higher at ${whereText(first, firstS, lastS)}`
  return {
    text: [lead, ...later].join(', '),
    higher: [...new Set(named.map((stretch) => stretch.sport))],
    atHeadline: higherAtHeadline(named),
  }
}

/**
 * One plain clause on how the sports compare across durations, from the grades the headline uses at the
 * durations both have, or null when fewer than two are graded in both, which is too few to say anything the
 * balance at 20 min does not. A sport is higher at a duration only where its grade is outside the other's range,
 * by the range alone. A lead at a single duration is noise and is not mentioned, nor is a dip inside a lead.
 * With no sport higher at two durations or more the sports "grade alike", at most lengths where a lead was
 * dropped as noise. Otherwise the clause names where a sport is higher, and a second sport after it where it is
 * higher at two durations too: "Running grades higher at 15 to 45 min".
 */
export function profileFinding(profile: GradeProfile): string | null {
  return claimOf(profile)?.text ?? null
}

/** Whether two or more durations are graded in both sports, so the profile has something to compare. */
export function profileComparable(profile: GradeProfile): boolean {
  return profileLeans(profile).length >= 2
}

/**
 * The finding, kept only where it agrees with the balance the hero states: "grade alike" for a level balance, and for
 * a lean a clause that names the sport the hero names, and does not call the other higher at the hour the hero grades.
 * The hero's lean is by the best estimate and the clause's by the range, so a lean of a few points can sit with sports
 * that grade alike by range; the card then says nothing rather than contradict the hero. Null without a hero lean.
 */
export function findingAgreeing(profile: GradeProfile, lean: BalanceLean | null): string | null {
  const claim = claimOf(profile)
  if (claim === null || lean === null) return null
  if (claim.higher.length === 0) return lean === 'even' ? claim.text : null
  if (lean === 'even' || !claim.higher.includes(lean)) return null
  return claim.atHeadline === null || claim.atHeadline === lean ? claim.text : null
}

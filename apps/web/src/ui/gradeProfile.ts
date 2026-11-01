import { EQUIVALENCE_DURATIONS_S, PROFILE_DURATIONS_S } from '@rca/core/constants'
import { equivalenceFor } from '@rca/core/pipeline'
import type { AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { HrCalibration, Sport } from '@rca/core/types'
import { activityMasses } from './activityMasses'
import { leanOfRange } from '../domain/lean'
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
 * The ride's running equivalents at the profile durations that a combine does not price, from the ride
 * curve's best at each. Each costs one pass over the draws, so they are priced here, for the chart that
 * draws them, rather than in every combine. They are priced as a combine prices its own: under the library's
 * heart-rate calibration (`HeartRateJudgement.calibration`, which the result's own equivalents were priced
 * with, not the period's own check), at the body mass the ride was ridden at (massKg without dated masses),
 * with the draws built once for all of them.
 */
export function profileEquivalents(
  result: AnalysisResult,
  massKg: number,
  calibration: HrCalibration | null,
): Equivalence[] {
  const held = new Set(result.equivalents.map((equivalent) => equivalent.durationS))
  const masses = activityMasses(result.activities)
  const powers = PROFILE_DURATIONS_S.filter(
    (durationS) => !EQUIVALENCE_DURATIONS_S.includes(durationS) && !held.has(durationS),
  ).flatMap((durationS) => {
    const point = result.rideCurve.find((candidate) => candidate.durationS === durationS)
    return point !== undefined && Number.isFinite(point.value)
      ? [{ durationS, ridePowerW: point.value, rideKg: masses[point.activityId ?? ''] ?? massKg }]
      : []
  })
  if (powers.length === 0) return []
  const equivalence = equivalenceFor(calibration)
  return powers.map(({ durationS, ridePowerW, rideKg }) => ({
    durationS,
    ridePowerW,
    runSpeed: equivalence(ridePowerW, rideKg),
  }))
}

/**
 * Each sport's age grade at every duration from 3 min to 3 h that its best-effort curve and the age
 * standards grade. A duration without a best, or without a standard, is left out, never filled in. The
 * ride's equivalents beyond the result's own are priced at massKg, the body mass the result was made for, and
 * under the same calibration.
 */
export function gradeProfile(
  result: AnalysisResult,
  profile: AgeProfile,
  massKg: number,
  calibration: HrCalibration | null,
): GradeProfile {
  const priced = {
    ...result,
    equivalents: [...result.equivalents, ...profileEquivalents(result, massKg, calibration)],
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
  const pairings = profileLeans(profile)
  const firstS = pairings[0]?.durationS
  const lastS = pairings.at(-1)?.durationS
  if (pairings.length < 2 || firstS === undefined || lastS === undefined) return null
  const named = namedStretches(pairings)
  const [first, ...rest] = named
  if (first === undefined) {
    const anyLead = pairings.some((pairing) => pairing.lean !== 'even')
    const [one, other] = BALANCE_PAIR
    return `${SPORT_TITLE[one]} and ${SPORT_NOUN[other]} grade alike${anyLead ? ' at most lengths' : ''}`
  }
  const later = rest.map(
    (stretch) => `${SPORT_NOUN[stretch.sport]} at ${whereText(stretch, firstS, lastS)}`,
  )
  const lead = `${subject(first.sport)} grades higher at ${whereText(first, firstS, lastS)}`
  return [lead, ...later].join(', ')
}

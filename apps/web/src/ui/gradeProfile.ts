import { PROFILE_DURATIONS_S } from '@rca/core/constants'
import { profileEquivalents } from '@rca/core/pipeline'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { leanOfRange } from '../domain/lean'
import { balanceGap } from './balanceGap'
import { sportGrade } from './grades'
import type { AgeProfile, SportGrade } from './grades'
import { BALANCE_PAIR, SPORT_ORDER } from './sports'

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

/** Whether two or more durations are graded in both sports, so the profile has something to compare. */
export function profileComparable(profile: GradeProfile): boolean {
  return profileLeans(profile).length >= 2
}

import { PROFILE_DURATIONS_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { balanceGap } from './balanceGap'
import { sportGrade } from './grades'
import type { AgeProfile, SportGrade } from './grades'
import { effortLabel } from './records'
import { SPORT_NOUN, SPORT_ORDER, SPORT_TITLE } from './sports'

/** A sport's age grade at one duration: a run is a point, and a ride carries its range. */
export interface ProfilePoint {
  durationS: number
  grade: SportGrade
}

/** Each sport's graded points, shortest duration first. A duration with no grade has no point. */
export type GradeProfile = Record<Sport, ProfilePoint[]>

/**
 * Each sport's age grade at every duration from 3 min to 3 h that its best-effort curve and the age
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

/** A duration with both sports graded: the gap between their centre grades, and whether it is within range. */
interface Pairing {
  durationS: number
  /** The first sport's centre grade less the second's, in whole points, as the balance takes it. */
  gap: number
  /** Whether the gap is inside the estimate's range, so it is not told apart from even. */
  within: boolean
}

/** The durations both sports are graded at, each with the gap between the two centre grades. */
function pairingsOf(profile: GradeProfile): Pairing[] {
  const [first, second] = SPORT_ORDER
  return profile[first].flatMap((point) => {
    const other = profile[second].find((candidate) => candidate.durationS === point.durationS)
    if (other === undefined) return []
    const gap = balanceGap(point.grade, other.grade)
    return [{ durationS: point.durationS, gap: gap.centre, within: gap.lean === 'even' }]
  })
}

/** The durations, in seconds, at which both sports are graded. */
export function profileDurations(profile: GradeProfile): number[] {
  return pairingsOf(profile).map((pairing) => pairing.durationS)
}

/** The sport that is not this one, among the two the page compares. */
function otherThan(sport: Sport): Sport {
  return SPORT_ORDER[0] === sport ? SPORT_ORDER[1] : SPORT_ORDER[0]
}

/** The sport with the higher centre grade at a duration, or null where the two read the same. */
function higherAt(pairing: Pairing): Sport | null {
  if (pairing.gap === 0) return null
  return pairing.gap > 0 ? SPORT_ORDER[0] : SPORT_ORDER[1]
}

/** A stretch of durations, from one to another, over which one sport grades higher. */
interface Stretch {
  sport: Sport
  fromS: number
  toS: number
}

/** The stretches where each sport grades higher, with neighbouring durations of one sport merged. */
function stretchesOf(pairings: readonly Pairing[]): Stretch[] {
  const stretches: Stretch[] = []
  for (const pairing of pairings) {
    const sport = higherAt(pairing)
    if (sport === null) continue
    const last = stretches.at(-1)
    if (last !== undefined && last.sport === sport) last.toS = pairing.durationS
    else stretches.push({ sport, fromS: pairing.durationS, toS: pairing.durationS })
  }
  return stretches
}

/** The middle of the gaps' sizes in whole points, and never under one: a sport that grades higher does so by a point. */
function medianGap(pairings: readonly Pairing[]): number {
  const sizes = pairings.map((pairing) => Math.abs(pairing.gap)).sort((a, b) => a - b)
  const middle = sizes.length / 2
  const median = ((sizes[Math.floor(middle)] ?? 0) + (sizes[Math.ceil(middle) - 1] ?? 0)) / 2
  return Math.max(1, Math.round(median))
}

/** The gap must change by this many points from the shortest shared duration to the longest to count as a shape. */
const SHAPE_POINTS = 4

/** How the gap changes from the shortest shared duration to the longest, as a clause. */
function shapeText(pairings: readonly Pairing[]): string {
  const size = (pairing: Pairing | undefined) => Math.abs(pairing?.gap ?? 0)
  const change = size(pairings.at(-1)) - size(pairings[0])
  if (change >= SHAPE_POINTS) return ', and the gap widens toward longer efforts'
  if (change <= -SHAPE_POINTS) return ', and the gap narrows toward longer efforts'
  return ', by a steady margin'
}

/** Where a stretch of durations is, in words: up to its end, from its start on, at one, or between two. */
function whereText(stretch: Stretch, firstS: number, lastS: number): string {
  if (stretch.fromS === firstS) return `up to ${effortLabel(stretch.toS)}`
  if (stretch.toS === lastS) return `from ${effortLabel(stretch.fromS)} on`
  if (stretch.fromS === stretch.toS) return `at ${effortLabel(stretch.fromS)}`
  return `from ${stretch.fromS / 60} to ${effortLabel(stretch.toS)}`
}

/** The sport that grades higher throughout, with how far and how the gap changes, as one sentence. */
function steadyText(sport: Sport, pairings: readonly Pairing[]): string {
  const points = medianGap(pairings)
  const firstS = pairings[0]?.durationS ?? 0
  const lastS = pairings.at(-1)?.durationS ?? 0
  // A duration where the two read the same is not one the sport grades higher at, so "every" would be untrue.
  const every = pairings.every((pairing) => higherAt(pairing) !== null)
  const span = `${every ? 'at every duration ' : ''}from ${firstS / 60} to ${effortLabel(lastS)}`
  const unit = points === 1 ? 'point' : 'points'
  const how = `grades about ${points} ${unit} higher than your ${SPORT_NOUN[otherThan(sport)]}`
  return `Your ${SPORT_NOUN[sport]} ${how} ${span}${shapeText(pairings)}.`
}

/**
 * The sentence for a lead that changes hands, where each sport grades higher, such as "Your cycling grades
 * higher up to 7 min, your running from 10 min on." A sport that grades higher at neighbouring stretches
 * has them said together.
 */
function changesText(stretches: readonly Stretch[], firstS: number, lastS: number): string {
  const holders: { sport: Sport; where: string[] }[] = []
  for (const stretch of stretches) {
    const where = whereText(stretch, firstS, lastS)
    const last = holders.at(-1)
    if (last !== undefined && last.sport === stretch.sport) last.where.push(where)
    else holders.push({ sport: stretch.sport, where: [where] })
  }
  const parts = holders.map((holder, index) => {
    const lead =
      index === 0
        ? `Your ${SPORT_NOUN[holder.sport]} grades higher`
        : `your ${SPORT_NOUN[holder.sport]}`
    return `${lead} ${holder.where.join(' and ')}`
  })
  return `${parts.join(', ')}.`
}

/** The sport whose grades are estimates, drawn with a range: a ride's, graded through its running equivalent. */
function estimatedSport(profile: GradeProfile): Sport | null {
  return (
    SPORT_ORDER.find((sport) => profile[sport].some((point) => point.grade.range !== null)) ?? null
  )
}

const SAME_GRADE = `Your ${SPORT_NOUN[SPORT_ORDER[0]]} and ${SPORT_NOUN[SPORT_ORDER[1]]} grade the same at every duration.`

/**
 * One plain sentence on the shape of the gap between the sports across durations, from the centre grades
 * at the durations both have, or null when fewer than two durations are graded in both, which is too few
 * to say anything the balance at 20 min does not. When the gap is within the estimate's range at more
 * than half the durations, it adds that the estimated sport's grades are estimates.
 */
export function profileFinding(profile: GradeProfile): string | null {
  const pairings = pairingsOf(profile)
  const firstS = pairings[0]?.durationS
  const lastS = pairings.at(-1)?.durationS
  if (pairings.length < 2 || firstS === undefined || lastS === undefined) return null
  const stretches = stretchesOf(pairings)
  const [only] = stretches
  if (only === undefined) return SAME_GRADE
  const main =
    stretches.length === 1
      ? steadyText(only.sport, pairings)
      : changesText(stretches, firstS, lastS)
  const estimated = estimatedSport(profile)
  const mostlyWithin = pairings.filter((pairing) => pairing.within).length * 2 > pairings.length
  if (!mostlyWithin || estimated === null) return main
  return `${main} ${SPORT_TITLE[estimated]}'s grades are estimated, so a gap this size is within their range.`
}

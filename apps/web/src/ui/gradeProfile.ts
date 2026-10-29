import { EQUIVALENCE_DURATIONS_S, PROFILE_DURATIONS_S } from '@rca/core/constants'
import { equivalenceFor } from '@rca/core/pipeline'
import type { AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { HrCalibration, Sport } from '@rca/core/types'
import { activityMasses } from './activityMasses'
import { balanceGap } from './balanceGap'
import { sportGrade } from './grades'
import type { AgeProfile, SportGrade } from './grades'
import { effortLabel } from './records'
import { SPORT_NOUN, SPORT_ORDER } from './sports'

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

/** A duration with both sports graded: the gap between their centre grades, and which way the balance reads it. */
export interface Lean {
  durationS: number
  /** The first sport's centre grade less the second's, in whole points, as the balance takes it. */
  gap: number
  /** A sport leads only where its grade is outside the other's range, in whole percents; else the two are even. */
  lean: Sport | 'even'
}

/**
 * The durations both sports are graded at, each with its gap and lean. They come from the grades the
 * headline uses, through the balance's own `balanceGap`, so the lean at 20 min is the headline's.
 */
export function profileLeans(profile: GradeProfile): Lean[] {
  const [first, second] = SPORT_ORDER
  return profile[first].flatMap((point) => {
    const other = profile[second].find((candidate) => candidate.durationS === point.durationS)
    if (other === undefined) return []
    const gap = balanceGap(point.grade, other.grade)
    return [{ durationS: point.durationS, gap: gap.centre, lean: gap.lean }]
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

/** The sport that is not this one, among the two the page compares. */
function otherThan(sport: Sport): Sport {
  return SPORT_ORDER[0] === sport ? SPORT_ORDER[1] : SPORT_ORDER[0]
}

/**
 * Durations over which one sport leads, from the first to the last of them. Durations where the two are
 * even between them are not a break, since a grade at the edge of a range flips with a rounding; they are
 * listed in `apart`.
 */
interface Stretch {
  sport: Sport
  fromS: number
  toS: number
  apart: number[]
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
    } else stretches.push({ sport: lean, fromS: durationS, toS: durationS, apart: [] })
    even = []
  }
  return stretches
}

/** The middle of the gaps' sizes in whole points, and never under one: a sport that leads does so by a point. */
function medianGap(pairings: readonly Lean[]): number {
  const sizes = pairings.map((pairing) => Math.abs(pairing.gap)).sort((a, b) => a - b)
  const middle = sizes.length / 2
  const median = ((sizes[Math.floor(middle)] ?? 0) + (sizes[Math.ceil(middle) - 1] ?? 0)) / 2
  return Math.max(1, Math.round(median))
}

/** The gap must change by this many points from the shortest shared duration to the longest to count as a shape. */
const SHAPE_POINTS = 4

/** How the gap changes from the shortest shared duration to the longest, as a clause. */
function shapeText(pairings: readonly Lean[]): string {
  const size = (pairing: Lean | undefined) => Math.abs(pairing?.gap ?? 0)
  const change = size(pairings.at(-1)) - size(pairings[0])
  if (change >= SHAPE_POINTS) return ', and the gap widens toward longer efforts'
  if (change <= -SHAPE_POINTS) return ', and the gap narrows toward longer efforts'
  return ', by a steady margin'
}

/** Durations in words: "30 min", "30 and 45 min", "20, 30 and 45 min". */
function listText(durations: readonly number[]): string {
  const [only, ...rest] = durations
  if (only !== undefined && rest.length === 0) return effortLabel(only)
  const minutes = durations.map((durationS) => durationS / 60)
  return `${minutes.slice(0, -1).join(', ')} and ${minutes.at(-1)} min`
}

/** Where a stretch is, in words: up to its end, from its start on, at one, or between two; its dips named. */
function whereText(stretch: Stretch, firstS: number, lastS: number): string {
  const { fromS, toS, apart } = stretch
  let where = `from ${fromS / 60} to ${effortLabel(toS)}`
  if (fromS === firstS) where = `up to ${effortLabel(toS)}`
  else if (toS === lastS) where = `from ${effortLabel(fromS)} on`
  else if (fromS === toS) where = `at ${effortLabel(fromS)}`
  return apart.length === 0 ? where : `${where}, apart from ${listText(apart)}`
}

/** The sport that leads at every shared duration, with how far and how the gap changes, as one sentence. */
function steadyText(sport: Sport, pairings: readonly Lean[]): string {
  const points = medianGap(pairings)
  const firstS = pairings[0]?.durationS ?? 0
  const lastS = pairings.at(-1)?.durationS ?? 0
  const span = `at every duration from ${firstS / 60} to ${effortLabel(lastS)}`
  const unit = points === 1 ? 'point' : 'points'
  const how = `grades about ${points} ${unit} higher than your ${SPORT_NOUN[otherThan(sport)]}`
  return `Your ${SPORT_NOUN[sport]} ${how} ${span}${shapeText(pairings)}.`
}

/** Said after the stretches that lead, so the durations they leave out are not left unsaid. */
const ELSEWHERE_WITHIN = '; elsewhere the two are within range'

/**
 * The stretches where a sport leads, such as "Your cycling grades higher up to 7 min, your running from 10
 * min on". A sport's stretches that only even durations separate are one, naming the durations between.
 */
function stretchesText(stretches: readonly Stretch[], firstS: number, lastS: number): string {
  return stretches
    .map((stretch, index) => {
      const noun = SPORT_NOUN[stretch.sport]
      const lead = index === 0 ? `Your ${noun} grades higher` : `your ${noun}`
      return `${lead} ${whereText(stretch, firstS, lastS)}`
    })
    .join(', ')
}

/** The sport whose grades are estimates, drawn with a range: a ride's, graded through its running equivalent. */
function estimatedSport(profile: GradeProfile): Sport | null {
  return (
    SPORT_ORDER.find((sport) => profile[sport].some((point) => point.grade.range !== null)) ?? null
  )
}

/** The sentence for sports that no duration separates: every gap is within the estimate's range. */
function noneSeparate(profile: GradeProfile, firstS: number, lastS: number): string {
  const [a, b] = [SPORT_NOUN[SPORT_ORDER[0]], SPORT_NOUN[SPORT_ORDER[1]]]
  const estimated = estimatedSport(profile)
  const span = `at every duration from ${firstS / 60} to ${effortLabel(lastS)}`
  const reason =
    estimated === null
      ? 'the two grade the same'
      : `the gap is within ${SPORT_NOUN[estimated]}'s range`
  return `No duration separates your ${a} and ${b}: ${span} ${reason}.`
}

/**
 * One plain sentence on how the sports compare across durations, from the grades the headline uses at
 * the durations both have, or null when fewer than two are graded in both, which is too few to say
 * anything the balance at 20 min does not. A sport is higher at a duration only where its grade is
 * outside the other's range, the balance's rule; the rest are within range. When one sport is outside
 * the range at every duration it says by how much and how the gap changes. Otherwise it names the
 * stretches where a sport is higher, and that the two are within range elsewhere.
 */
export function profileFinding(profile: GradeProfile): string | null {
  const pairings = profileLeans(profile)
  const firstS = pairings[0]?.durationS
  const lastS = pairings.at(-1)?.durationS
  if (pairings.length < 2 || firstS === undefined || lastS === undefined) return null
  const stretches = stretchesOf(pairings)
  const [only] = stretches
  if (only === undefined) return noneSeparate(profile, firstS, lastS)
  const everyOutside = pairings.every((pairing) => pairing.lean !== 'even')
  if (everyOutside && stretches.length === 1) return steadyText(only.sport, pairings)
  return `${stretchesText(stretches, firstS, lastS)}${everyOutside ? '' : ELSEWHERE_WITHIN}.`
}

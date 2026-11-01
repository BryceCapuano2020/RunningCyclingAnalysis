import { CURVE_START_S, durationProfile, profileNeeds } from '@rca/core/profile'
import type { DurationProfile, ProfileGap, ProfilePoint } from '@rca/core/profile'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { countSport } from './records'

/**
 * The curve a sport's profile reads, in the sport's own unit. A ride's is its measured watts alone:
 * estimated watts are a model's output, so they would be compared with themselves. A run's is its
 * metabolic W/kg, which is mass-free for a comparison of one curve with itself.
 */
const PROFILE_CURVE: Record<Sport, (result: AnalysisResult) => Curve> = {
  run: (result) => result.runCurve,
  ride: (result) => result.rideMeasuredCurve,
}

/** What a sport's bests need besides durations: a ride's must be measured. */
const PROFILE_NEEDS_SUFFIX: Record<Sport, string> = {
  run: '',
  ride: ', with a power meter',
}

/** A best curve as profile points, each with the session its best was set in, looked up among `activities`. */
export function pointsOf(curve: Curve, activities: readonly ActivitySummary[]): ProfilePoint[] {
  const sessions = new Map(
    activities.map((activity) => [activity.id, activity.sessionKey ?? activity.id]),
  )
  return curve.map((point) => ({
    durationS: point.durationS,
    value: point.value,
    sessionId: point.activityId === null ? null : (sessions.get(point.activityId) ?? null),
  }))
}

/** A sport's best curve as profile points. */
export function profilePoints(result: AnalysisResult, sport: Sport): ProfilePoint[] {
  return pointsOf(PROFILE_CURVE[sport](result), result.activities)
}

/**
 * The profiles worked out for each result, by sport. A result does not change, and a page asks again on
 * every visit, so each is worked out once.
 */
const PROFILES = new WeakMap<AnalysisResult, Map<Sport, DurationProfile>>()

/** Which durations of a sport's best curve stand out from the rest of it. */
export function profileOf(result: AnalysisResult, sport: Sport): DurationProfile {
  const known = PROFILES.get(result) ?? new Map<Sport, DurationProfile>()
  PROFILES.set(result, known)
  const profile =
    known.get(sport) ??
    durationProfile(
      profilePoints(result, sport),
      CURVE_START_S[sport],
      countSport(result.activities, sport),
    )
  known.set(sport, profile)
  return profile
}

/** What a sport's profile is missing, in one muted line, such as "Needs a best at 12 min or more". */
export function profileNeedsText(sport: Sport, missing: readonly ProfileGap[]): string {
  return `${profileNeeds(missing, CURVE_START_S[sport])}${PROFILE_NEEDS_SUFFIX[sport]}`
}

/** The profiles of the library's bests, by the curve they were made from, which a state hands out once. */
const LIBRARY_PROFILES = new WeakMap<Curve, DurationProfile>()

/**
 * Which durations of a sport's best curve over the whole library stand out from the rest of it, for a page whose
 * period holds too few activities to judge its own. `library` names the sessions the bests came from and `count`
 * is the sport's activities in it, which the level a stand-out is judged at scales with.
 */
export function libraryProfileOf(
  curve: Curve,
  library: readonly ActivitySummary[],
  sport: Sport,
  count: number,
): DurationProfile {
  const known = LIBRARY_PROFILES.get(curve)
  if (known !== undefined) return known
  const profile = durationProfile(pointsOf(curve, library), CURVE_START_S[sport], count)
  LIBRARY_PROFILES.set(curve, profile)
  return profile
}

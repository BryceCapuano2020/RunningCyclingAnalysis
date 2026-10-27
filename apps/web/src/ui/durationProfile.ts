import { durationProfile, profileNeeds } from '@rca/core/profile'
import type { DurationProfile, ProfileGap, ProfilePoint } from '@rca/core/profile'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'

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

/** A sport's best curve as profile points, each with the session its best was set in. */
export function profilePoints(result: AnalysisResult, sport: Sport): ProfilePoint[] {
  const sessions = new Map(
    result.activities.map((activity) => [activity.id, activity.sessionKey ?? activity.id]),
  )
  return PROFILE_CURVE[sport](result).map((point) => ({
    durationS: point.durationS,
    value: point.value,
    sessionId: point.activityId === null ? null : (sessions.get(point.activityId) ?? null),
  }))
}

/** Which durations of a sport's best curve stand out from the rest of it. */
export function profileOf(result: AnalysisResult, sport: Sport): DurationProfile {
  return durationProfile(profilePoints(result, sport))
}

/** What a sport's profile is missing, in one muted line, such as "Needs a best at 12 min or more". */
export function profileNeedsText(sport: Sport, missing: readonly ProfileGap[]): string {
  return `${profileNeeds(missing)}${PROFILE_NEEDS_SUFFIX[sport]}`
}

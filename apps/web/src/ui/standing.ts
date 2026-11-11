import type { AnalysisResult } from '@rca/core/pipeline'
import { sportStanding } from '@rca/core/standing'
import type { HalfForecast, SportStanding, StandingContext } from '@rca/core/standing'
import type { AgeProfile } from './grades'

/** The standings made for a result, by the profile and context they were made for: one object per result and athlete, read by every surface. */
const made = new WeakMap<AnalysisResult, Map<string, SportStanding>>()

function keyOf(
  profile: AgeProfile | null,
  context: StandingContext | undefined,
  half: HalfForecast | null,
): string {
  const who = profile === null ? 'none' : `${profile.birthYear}|${profile.sex}`
  const run = half === null ? 'threshold' : `${half.seconds}|${half.low}|${half.high}|${half.atMs}`
  return context === undefined
    ? `${who}|${run}`
    : `${who}|${context.massKg}|${context.units}|${run}`
}

/**
 * The athlete's standing in a result (`sportStanding` in core): the grades (a run's by its forecast half, `halfForecastFor`, where
 * the page has one), the ride as a run, the lead and its range, and
 * what each sport needs to match the other. The hero, the tiles, the sport pages, the cross-sport card, the share card, the import
 * notice and the method page all read it from here, so none works out a figure of its own. Memoised on the result, because a result
 * is never changed.
 */
export function standingOf(
  result: AnalysisResult,
  profile: AgeProfile | null,
  context?: StandingContext,
  half: HalfForecast | null = null,
): SportStanding {
  const key = keyOf(profile, context, half)
  let byKey = made.get(result)
  if (byKey === undefined) {
    byKey = new Map()
    made.set(result, byKey)
  }
  let standing = byKey.get(key)
  if (standing === undefined) {
    standing = sportStanding(result, profile, context, half)
    byKey.set(key, standing)
  }
  return standing
}

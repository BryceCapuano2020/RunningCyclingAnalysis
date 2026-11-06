/**
 * Everything the lift module reads from a log: one summary per lift and the weekly load. It travels beside
 * the SessionState fields, never on AnalysisResult (docs/design/strength.md, decision 6).
 */
import type { AthleteSettings } from '../athlete'
import { exerciseInfo } from './catalog'
import type { LiftRegion } from './catalog'
import { estimateLift, liftBests } from './estimate'
import type { LiftBest, LiftEstimate } from './estimate'
import { exerciseKeyOf } from './key'
import { relativeStrength } from './relative'
import type { RelativeStrength } from './relative'
import { LIFT_REVISION } from './revision'
import type { Equipment, ExerciseKey, LiftSet } from './types'
import { weeklyLoad } from './weeklyLoad'
import type { LiftWeek } from './weeklyLoad'

export type LiftFlag = 'deadlift-may-read-low' | 'effort-unknown'

export interface LiftSummary {
  key: ExerciseKey
  exercise: string
  equipment: Equipment
  region: LiftRegion
  /** Null with a reason: a bodyweight lift has no e1RM, and a lift with no eligible set has nothing to read. */
  estimate: LiftEstimate | null
  reason: 'bodyweight' | 'no-eligible-set' | null
  /** The heaviest working set in the window; never a range. */
  floor: LiftBest | null
  repBests: LiftBest[]
  relative: RelativeStrength | null
  /** Date of the lift's newest set in the period. */
  lastDate: string
  flags: LiftFlag[]
}

export interface LiftState {
  revision: number
  lifts: LiftSummary[]
  weeks: LiftWeek[]
}

/** Local dates, inclusive; either end may be open. Sets after `to` are not read, so a past period replays as it was. */
export interface LiftPeriod {
  from?: string
  to?: string
}

function summarize(
  key: ExerciseKey,
  sets: readonly LiftSet[],
  settings: AthleteSettings,
): LiftSummary {
  const first = sets[0] as LiftSet
  const info = exerciseInfo(first.exercise)
  const bodyweight = first.equipment === 'bodyweight' || info.bodyweight === true
  const estimate = bodyweight ? null : estimateLift(sets)
  const { floor, repBests } = liftBests(sets)
  const flags: LiftFlag[] = []
  if (estimate && info.deadliftFamily) flags.push('deadlift-may-read-low')
  if (!sets.some((s) => !s.warmup && s.rpe !== undefined)) flags.push('effort-unknown')
  return {
    key,
    exercise: first.exercise,
    equipment: first.equipment,
    region: info.region,
    estimate,
    reason: estimate ? null : bodyweight ? 'bodyweight' : 'no-eligible-set',
    floor,
    repBests,
    relative: estimate ? relativeStrength(estimate, settings, info.deadliftFamily === true) : null,
    lastDate: sets.reduce((a, s) => (s.date > a ? s.date : a), first.date),
    flags,
  }
}

/**
 * The state of a log. `period` cuts the sets by local date (the default is everything). Each lift is read
 * as of its own newest set in the period, as the library's default period reads from the newest activity.
 */
export function buildLiftState(
  sets: readonly LiftSet[],
  settings: AthleteSettings,
  period: LiftPeriod = {},
): LiftState {
  const inPeriod = sets.filter(
    (s) =>
      (period.from === undefined || s.date >= period.from) &&
      (period.to === undefined || s.date <= period.to),
  )
  const byLift = new Map<ExerciseKey, LiftSet[]>()
  for (const s of inPeriod) {
    const key = exerciseKeyOf(s)
    byLift.set(key, [...(byLift.get(key) ?? []), s])
  }
  const lifts = [...byLift.entries()]
    .map(([key, group]) => summarize(key, group, settings))
    .sort((a, b) =>
      a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : a.key < b.key ? -1 : 1,
    )
  return { revision: LIFT_REVISION, lifts, weeks: weeklyLoad(inPeriod) }
}

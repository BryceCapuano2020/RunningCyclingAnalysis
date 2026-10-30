import { sameMasses } from '../athlete/mass'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  CriticalPowerFit,
  HrCrossCheck,
  Sport,
} from '../types'
import type { EstimatedRideGate } from './estimatedRide'
import type { HeartRateJudgement } from './setAsideTypes'
import type { BestCurves } from './rideCurves'
import type { TrustedHeartRate } from './trustedHeartRate'
import type { BikeModelSource } from '../virtualPower'

/**
 * What judging a library worked out on the way, which the analysis of the same activities needs again: the bike
 * model, the best curves under the final ride gate, the thresholds they give, the trusted heart rate and the
 * heart-rate check. Kept beside the judgement it made, in memory only (it is not part of what the session posts).
 * An analysis of the whole library under the same masses is the same work, so it takes this instead of doing it again.
 */
export interface JudgedWork {
  /** The digests judged, in canonical order. */
  ordered: ActivityDigest[]
  settings: AthleteSettings
  bikeModel: BikeModel
  bikeModelSource: BikeModelSource
  curves: BestCurves
  /** Each sport's threshold fit before refusal. */
  fits: Record<Sport, CriticalPowerFit | null>
  heart: TrustedHeartRate
  gate: EstimatedRideGate | null
  cross: HrCrossCheck
}

const workOfJudgement = new WeakMap<HeartRateJudgement, JudgedWork>()

export function keepWork(judgement: HeartRateJudgement, work: JudgedWork): void {
  workOfJudgement.set(judgement, work)
}

/** The work a judgement was made from; none for a judgement of a library without heart rate. */
export function judgedWorkOf(judgement: HeartRateJudgement): JudgedWork | undefined {
  return workOfJudgement.get(judgement)
}

/**
 * Whether the work answers an analysis of these digests: the same activities and masses, the same ride gate, and
 * the same heart rates set aside, so every figure the analysis would work out is the work's.
 */
export function answers(
  work: JudgedWork,
  ordered: ActivityDigest[],
  settings: AthleteSettings,
  given: { heartRateSetAside?: ReadonlySet<string>; rideGate?: EstimatedRideGate | null },
): boolean {
  const { setAside } = work.heart
  const named = given.heartRateSetAside
  return (
    named !== undefined &&
    given.rideGate === work.gate &&
    sameMasses(work.settings, settings) &&
    work.ordered.length === ordered.length &&
    work.ordered.every((digest, i) => digest === ordered[i]) &&
    named.size === setAside.size &&
    [...named].every((id) => setAside.has(id))
  )
}

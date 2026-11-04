import { HEADLINE_DURATION_S, CP_FIT_HOLD_S } from '../constants'
import { sessionsOf } from '../effort'
import type { EffortGate, EffortReference, GateReference } from '../effort'
import { effortGateOf } from '../effort'
import type { ActivityDigest, BikeModel, Curve, EffortCheck, Sport } from '../types'
import { effortsCount } from './effortTrust'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { twentyMinutePoints } from './rideCurves'

/**
 * Both sports' effort gates: the 20 minute efforts, the library's references (what each can certify), the curve's best
 * 20 minutes as the floor, and the sessions that reached a hard heart rate.
 */
export function effortGatesOf(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  rideGate: EstimatedRideGate | null,
  floors: Record<Sport, Curve>,
  judged: EffortReference,
  setAside: ReadonlySet<string>,
): Record<Sport, EffortGate> {
  const points = twentyMinutePoints(ordered, masses, bikeModel, rideGate, setAside)
  const gateOf = (sport: Sport): EffortGate => {
    const own: GateReference = {
      bpm: judged.referenceHr[sport],
      reading: judged.reading[sport],
      source: judged.source[sport],
      from: judged.from[sport],
    }
    const held = [CP_FIT_HOLD_S, HEADLINE_DURATION_S]
      .map((durationS) => ({
        durationS,
        value: floors[sport].find((p) => p.durationS === durationS)?.value ?? Number.NaN,
      }))
      .find((candidate) => Number.isFinite(candidate.value))
    const sessions = sessionsOf(
      ordered.filter((d) => d.sport === sport && effortsCount(d)),
      own.bpm,
      own.reading,
      setAside,
    )
    return effortGateOf(points[sport], held ?? null, own, sessions)
  }
  return { run: gateOf('run'), ride: gateOf('ride') }
}

/**
 * Puts the gates' verdicts on the headline effort check, so the chip and the gate judge the same effort: the one with the
 * highest heart rate among the 20 minute bests.
 */
export function judgeHeadline(effort: EffortCheck[], gates: Record<Sport, EffortGate>): void {
  const headline = effort.find((check) => check.durationS === HEADLINE_DURATION_S)
  if (headline === undefined) return
  if (gates.run.share !== null) headline.runHrFraction = gates.run.share
  if (gates.ride.share !== null) headline.rideHrFraction = gates.ride.share
  if (gates.run.nearBest) headline.runNearBest = true
  if (gates.ride.nearBest) headline.rideNearBest = true
}

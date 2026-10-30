import { fitCriticalPowerUnchecked } from '../cp'
import { lowForPowerSetAside } from '../hr'
import type { AthleteSettings } from '../athlete/settings'
import type { ActivityDigest, BikeModel, CriticalPowerFit, DigestCurvePoint, Sport } from '../types'
import { plainCurve } from './bestCurve'
import { estimatedStanding, rideGateOf } from './estimatedRide'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { exemptHabitual, judgedTwentyMinutes } from '../effort'
import { bestCurves, pointWkg, twentyMinutePoints } from './rideCurves'
import type { BestCurves } from './rideCurves'
import { trustedHeartRate } from './trustedHeartRate'
import type { TrustedHeartRate } from './trustedHeartRate'

/** What the library had already judged, when a reader is given it (`CombineOptions`). */
export interface Given {
  /** Whose heart rate is set aside. Absent, it is judged among the digests. */
  heartRateSetAside?: ReadonlySet<string>
  /** The estimated-ride gate. Absent, it is built from the digests; null leaves every estimated point. */
  rideGate?: EstimatedRideGate | null
}

/** The best curves, the thresholds they give, and the heart rate that can be trusted against them. */
export interface JudgedCurves {
  curves: BestCurves
  /** Each sport's threshold fit before refusal, which the heart-rate judgement is made against. */
  fits: Record<Sport, CriticalPowerFit | null>
  heart: TrustedHeartRate
  gate: EstimatedRideGate | null
}

/** A curve point priced in its sport's fit unit, gross metabolic W/kg, before any estimated ride is refused. */
function unitsOf(
  masses: Masses,
  bikeModel: BikeModel,
): (digest: ActivityDigest, point: DigestCurvePoint) => number {
  const everyPointHolds = estimatedStanding(null)
  return (digest, point) => pointWkg(point, digest, masses, bikeModel, everyPointHolds).wkg
}

function fitsOf(curves: BestCurves): Record<Sport, CriticalPowerFit | null> {
  return {
    run: fitCriticalPowerUnchecked(plainCurve(curves.runBest)),
    ride: fitCriticalPowerUnchecked(curves.rideMetabolic),
  }
}

/**
 * The best curves and the heart-rate judgement, which depend on each other: whose heart rate is set aside
 * depends on the thresholds, the thresholds on which estimated rides count, and that on the heart rate of the
 * measured rides that is trusted. Judged among the digests, the first gate is fitted without the rides whose heart
 * rate reads low across the whole activity; the judgement is made against it, and if it sets more aside the gate
 * and the curves are taken once more without them. That is one rebuild, not a fixed point: the second gate is not
 * judged again, so a second round of set-aside is not looked for. Given the library's, both are used as they are.
 */
export function judgedCurves(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  todayKg: number,
  given: Given = {},
  athlete: Pick<AthleteSettings, 'measurements' | 'birthYear'> = {},
): JudgedCurves {
  const first = given.heartRateSetAside ?? lowForPowerSetAside(ordered)
  let gate = given.rideGate === undefined ? rideGateOf(ordered, first) : given.rideGate
  let curves = bestCurves(ordered, masses, bikeModel, todayKg, gate)
  let fits = fitsOf(curves)
  const heart = trustedHeartRate(
    ordered,
    fits,
    unitsOf(masses, bikeModel),
    given.heartRateSetAside,
    athlete,
  )
  if (given.heartRateSetAside === undefined && given.rideGate === undefined) {
    if (heart.setAside.size !== first.size) {
      gate = rideGateOf(ordered, heart.setAside)
      curves = bestCurves(ordered, masses, bikeModel, todayKg, gate)
      fits = fitsOf(curves)
    }
  }
  return { curves, fits, heart: withShapeExemption(heart, ordered, masses, bikeModel, gate), gate }
}

/**
 * The heart rate with a ride's `habitual` reference lifted when the ride's judged best 20 minutes is a power meter's
 * measurement (see `exemptHabitual`): the effort gate judges that point, so the reading is of that point.
 */
function withShapeExemption(
  heart: TrustedHeartRate,
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
): TrustedHeartRate {
  if (heart.effort.reading.ride !== 'habitual') return heart
  const rides = twentyMinutePoints(ordered, masses, bikeModel, gate, heart.setAside).ride
  return judgedTwentyMinutes(rides).measured
    ? { ...heart, effort: exemptHabitual(heart.effort, 'ride') }
    : heart
}

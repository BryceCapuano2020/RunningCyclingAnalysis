import { fitCriticalPowerUnchecked } from '../cp'
import { lowForPowerSetAside } from '../hr'
import type { ActivityDigest, BikeModel, CriticalPowerFit, DigestCurvePoint, Sport } from '../types'
import { plainCurve } from './bestCurve'
import { rideGateOf } from './estimatedRide'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { bestCurves, centralWkgFromWatts, rideWattsAt, runCentralWkg } from './rideCurves'
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

/** Each sport's curve points priced in its fit unit, gross metabolic W/kg. */
function unitsOf(
  masses: Masses,
  bikeModel: BikeModel,
): Record<Sport, (digest: ActivityDigest, point: DigestCurvePoint) => number> {
  return {
    run: (_digest, point) => runCentralWkg(point),
    ride: (digest, point) =>
      centralWkgFromWatts(
        rideWattsAt(point, masses.totalKg(digest), bikeModel),
        masses.bodyKg(digest),
      ),
  }
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
 * measured rides that is trusted. Judged among the digests, the first gate trusts every ride but those whose
 * heart rate reads low across the whole activity; the judgement is made against it, and the curves are taken
 * again with the gate it leaves if the judgement set more aside. Given the library's, both are used as they are.
 */
export function judgedCurves(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  todayKg: number,
  given: Given = {},
): JudgedCurves {
  const first = given.heartRateSetAside ?? lowForPowerSetAside(ordered)
  let gate = given.rideGate === undefined ? rideGateOf(ordered, first) : given.rideGate
  let curves = bestCurves(ordered, masses, bikeModel, todayKg, gate)
  let fits = fitsOf(curves)
  const units = unitsOf(masses, bikeModel)
  const heart = trustedHeartRate(
    ordered,
    fits,
    (digest, point) => units[digest.sport](digest, point),
    given.heartRateSetAside,
  )
  if (given.heartRateSetAside === undefined && given.rideGate === undefined) {
    if (heart.setAside.size !== first.size) {
      gate = rideGateOf(ordered, heart.setAside)
      curves = bestCurves(ordered, masses, bikeModel, todayKg, gate)
      fits = fitsOf(curves)
    }
  }
  return { curves, fits, heart, gate }
}

import { fitCriticalPowerUnchecked } from '../cp'
import type { ActivityDigest, AthleteSettings, BikeModel, DigestCurvePoint, Sport } from '../types'
import { plainCurve } from './bestCurve'
import { massesOf } from './masses'
import { orderedCurrent } from './ordered'
import { bestCurves, centralWkgFromWatts, rideWattsAt, runCentralWkg } from './rideCurves'
import { trustedHeartRate } from './trustedHeartRate'

/**
 * The ids of the activities whose heart rate is set aside when these digests are judged together, sorted:
 * the same judgement `combine` makes (its `heartRateSetAside`), without the rest of the analysis. Each
 * sport's thresholds are fitted to the digests' own best curves, with rides priced by `bikeModel`, and a
 * best effort that shows a heart rate a working sensor would not sets that activity's heart rate aside.
 * Judging a set that holds more than one period lets an earlier period be read by the same sensor
 * rules as the one on screen, at the cost of the curves and the loop in trustedHeartRate, not a whole analysis.
 */
export function heartRateSetAsideOf(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
): string[] {
  const ordered = orderedCurrent(digests)
  const masses = massesOf(settings)
  const { runBest, rideMetabolic } = bestCurves(ordered, masses, bikeModel, settings.massKg)
  const fits = {
    run: fitCriticalPowerUnchecked(plainCurve(runBest)),
    ride: fitCriticalPowerUnchecked(rideMetabolic),
  }
  const unit: Record<Sport, (digest: ActivityDigest, point: DigestCurvePoint) => number> = {
    run: (_digest, point) => runCentralWkg(point),
    ride: (digest, point) =>
      centralWkgFromWatts(
        rideWattsAt(point, masses.totalKg(digest), bikeModel),
        masses.bodyKg(digest),
      ),
  }
  const { setAside } = trustedHeartRate(ordered, fits, (digest, point) =>
    unit[digest.sport](digest, point),
  )
  return [...setAside].sort()
}

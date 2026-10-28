import { fitCriticalPowerUnchecked } from '../cp'
import { requirePositiveFinite } from '../math'
import type { ActivityDigest, AthleteSettings, DigestCurvePoint, Sport } from '../types'
import { plainCurve } from './bestCurve'
import type { HeartRateJudgement } from './setAsideTypes'
import { massesOf } from './masses'
import { orderedCurrent } from './ordered'
import {
  bestCurves,
  centralWkgFromWatts,
  fitBikeModelOver,
  rideWattsAt,
  runCentralWkg,
} from './rideCurves'
import { trustedHeartRate } from './trustedHeartRate'

/**
 * Whose heart rate is set aside when these digests are judged together, and what they were judged against:
 * the same judgement `combine` makes (its `heartRateSetAside`) without the rest of the analysis. Each
 * sport's thresholds are fitted to the digests' own best curves, with rides priced by a bike model fitted
 * over these digests, and a best effort that shows a heart rate a working sensor would not sets that
 * activity's heart rate aside. The reference heart rates are those the last judgement used, taken from the
 * activities that were kept.
 *
 * It is a judgement of the data, not of a period: the session runs it once over every visible activity, and
 * every period's analysis takes its answer, so an activity is judged the same whichever period is picked.
 * Throws a RangeError for a body or bike mass that is not a positive finite number, as `combine` does.
 */
export function judgeHeartRate(
  digests: ActivityDigest[],
  settings: AthleteSettings,
): HeartRateJudgement {
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const ordered = orderedCurrent(digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
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
  const { setAside, reference } = trustedHeartRate(ordered, fits, (digest, point) =>
    unit[digest.sport](digest, point),
  )
  return {
    setAside: [...setAside].sort(),
    referenceHr: { run: reference.run, ride: reference.ride },
    threshold: { run: fits.run?.cp ?? null, ride: fits.ride?.cp ?? null },
  }
}

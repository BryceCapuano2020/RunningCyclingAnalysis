import { criticalPowerOutcome, fitCriticalPowerUnchecked, wPrimeFloor } from '../cp'
import { requirePositiveFinite } from '../math'
import type {
  ActivityDigest,
  AthleteSettings,
  CriticalPowerFit,
  DigestCurvePoint,
  Sport,
} from '../types'
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
import { heartRateCrossCheck } from './heartRateCrossCheck'
import { trustedHeartRate } from './trustedHeartRate'

/** The library's best curves, priced as the analysis prices them, with the masses and bike model that priced them. */
function libraryCurves(digests: ActivityDigest[], settings: AthleteSettings) {
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const ordered = orderedCurrent(digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  const { runBest, rideMetabolic } = bestCurves(ordered, masses, bikeModel, settings.massKg)
  return { ordered, masses, bikeModel, runCurve: plainCurve(runBest), rideMetabolic }
}

/** Each sport's threshold fit of the library as the analysis reports it, null where it has none or refuses it. */
function reportedFits(
  { runCurve, rideMetabolic }: ReturnType<typeof libraryCurves>,
  massKg: number,
): Record<Sport, CriticalPowerFit | null> {
  return {
    run: criticalPowerOutcome(runCurve, { minWPrime: wPrimeFloor('run', massKg) }).fit,
    ride: criticalPowerOutcome(rideMetabolic, { minWPrime: wPrimeFloor('ride', massKg) }).fit,
  }
}

/**
 * The threshold fits of a library with no heart rate to judge: nothing is set aside and nothing calibrated, but the
 * zones still take their threshold references from the library.
 */
export function libraryFits(
  digests: ActivityDigest[],
  settings: AthleteSettings,
): HeartRateJudgement['fit'] {
  return reportedFits(libraryCurves(digests, settings), settings.massKg)
}

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
  const curves = libraryCurves(digests, settings)
  const { ordered, masses, bikeModel, runCurve, rideMetabolic } = curves
  const fits = {
    run: fitCriticalPowerUnchecked(runCurve),
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
  const { setAside, reference, observedMax, trusted } = trustedHeartRate(
    ordered,
    fits,
    (digest, point) => unit[digest.sport](digest, point),
  )
  const { kappa, lnKappaSe } = heartRateCrossCheck(trusted, masses, bikeModel, fits)
  return {
    setAside: [...setAside].sort(),
    referenceHr: { run: reference.run, ride: reference.ride },
    observedMaxHr: { run: observedMax.run, ride: observedMax.ride },
    fit: reportedFits(curves, settings.massKg),
    threshold: { run: fits.run?.cp ?? null, ride: fits.ride?.cp ?? null },
    calibration: kappa === null ? null : { kappa, lnKappaSe },
  }
}

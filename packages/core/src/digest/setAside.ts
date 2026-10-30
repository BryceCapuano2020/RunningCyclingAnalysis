import { criticalPowerOutcome, wPrimeFloor } from '../cp'
import type { EffortGate } from '../effort'
import { requirePositiveFinite } from '../math'
import type { ActivityDigest, AthleteSettings, CriticalPowerFit, Sport } from '../types'
import { plainCurve } from './bestCurve'
import type { HeartRateJudgement } from './setAsideTypes'
import { massesOf } from './masses'
import { orderedCurrent } from './ordered'
import { judgedCurves } from './judgedCurves'
import { bestCurves, fitBikeModelOver } from './rideCurves'
import type { BestCurves } from './rideCurves'
import { heartRateCrossCheck } from './heartRateCrossCheck'
import { gatedThreshold } from './effortGating'
import { thresholdTimeline } from './thresholdTimeline'
import { effortGatesOf } from './twentyMinute'

/**
 * Each sport's threshold fit of a library as the analysis reports it, null where it has none, refuses it, or the
 * effort gate (when given) says its best 20 minutes was not hard.
 */
function reportedFits(
  { runBest, rideMetabolic }: BestCurves,
  massKg: number,
  gates?: Record<Sport, EffortGate>,
): Record<Sport, CriticalPowerFit | null> {
  const run = criticalPowerOutcome(plainCurve(runBest), { minWPrime: wPrimeFloor('run', massKg) })
  const ride = criticalPowerOutcome(rideMetabolic, { minWPrime: wPrimeFloor('ride', massKg) })
  return {
    run: gates === undefined ? run.fit : gatedThreshold(gates.run, run, null).fit,
    ride: gates === undefined ? ride.fit : gatedThreshold(gates.ride, ride, null).fit,
  }
}

/**
 * The thresholds of a library with no heart rate to judge: nothing is set aside and nothing calibrated, but the
 * zones still take their threshold references from the library, as the whole-library fits and over time. With no
 * heart rate there is no estimated-ride gate.
 */
export function libraryThresholds(
  digests: ActivityDigest[],
  settings: AthleteSettings,
): Pick<HeartRateJudgement, 'fit' | 'thresholdTimeline'> {
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const ordered = orderedCurrent(digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  return {
    fit: reportedFits(
      bestCurves(ordered, masses, bikeModel, settings.massKg, null),
      settings.massKg,
    ),
    thresholdTimeline: thresholdTimeline(ordered, masses, bikeModel, settings.massKg, null),
  }
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
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const ordered = orderedCurrent(digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  const { curves, fits, heart, gate } = judgedCurves(
    ordered,
    masses,
    bikeModel,
    settings.massKg,
    {},
    settings,
  )
  const { setAside, reference, observedMax, observedSource, effort, trusted } = heart
  const { kappa, lnKappaSe } = heartRateCrossCheck(trusted, masses, bikeModel, fits)
  return {
    setAside: [...setAside].sort(),
    referenceHr: { run: reference.run, ride: reference.ride },
    observedMaxHr: { run: observedMax.run, ride: observedMax.ride },
    observedMaxSource: { run: observedSource.run, ride: observedSource.ride },
    effortReference: effort,
    fit: reportedFits(
      curves,
      settings.massKg,
      effortGatesOf(
        ordered,
        masses,
        bikeModel,
        gate,
        { run: plainCurve(curves.runBest), ride: curves.rideMetabolic },
        effort,
        setAside,
      ),
    ),
    thresholdTimeline: thresholdTimeline(ordered, masses, bikeModel, settings.massKg, gate, {
      referenceHr: effort.referenceHr,
      referenceReading: effort.reading,
      setAside,
    }),
    threshold: { run: fits.run?.cp ?? null, ride: fits.ride?.cp ?? null },
    calibration: kappa === null ? null : { kappa, lnKappaSe },
    rideGate: gate,
  }
}

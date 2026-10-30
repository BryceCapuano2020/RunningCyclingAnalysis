import { HALF_MARATHON_M, MARATHON_M, RUN_RACE_DISTANCES_M } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import { sessionEffort } from '@rca/core/effort'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { predictRunRaces, typicalWeeklyDistance } from '@rca/core/predict'
import type { PredictionMethod, RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import { METRES_PER_MILE } from '@rca/core/units'

/** The sport the running predictor reads. */
const RUN: Sport = 'run'

/*
 * Race predictions by sport. A sport with set race distances adds its predictor here, and the sport
 * page shows its predictions with the same table; a sport without one shows none.
 */

/**
 * The runs whose bests may be carried to a race. A treadmill's pace is no best, and a run that heart rate shows never
 * reached a hard effort (its peak under the hard line of the reference, or a reference that cannot certify a
 * maximum) carries its easy pace to a race as if it were a hard one: a library of easy runs predicts an easy 5 km.
 * A run without a heart rate, or with it set aside, counts, since nothing says it was easy.
 */
function anchorRuns(result: AnalysisResult): ActivitySummary[] {
  const setAside = new Set(result.heartRateSetAside)
  const { reference } = result.effortGate[RUN]
  return result.activities.filter(
    (activity) =>
      activity.sport === RUN &&
      effortsCount(activity) &&
      (setAside.has(activity.id) ||
        sessionEffort(activity.maxHeartRate, result.runMaxHeartRate, reference) !== 'notHard'),
  )
}

/** Each sport's predictor from its period's result, where it has one. */
export const RACE_PREDICTORS: Partial<Record<Sport, (result: AnalysisResult) => RunPredictions>> = {
  run: (result) => {
    const runs = result.activities.filter((activity) => activity.sport === RUN)
    return predictRunRaces({
      // A best shorter than the mile is too short to carry to a race.
      bests: anchorRuns(result).flatMap((run) =>
        (run.distanceBests ?? []).filter((best) => best.distanceM >= METRES_PER_MILE),
      ),
      vo2max: result.runVo2max,
      weeklyM: typicalWeeklyDistance(runs),
    })
  },
}

/** A sport's race predictions, or null when it has no predictor or the evidence gives no race. */
export function racePredictionsOf(sport: Sport, result: AnalysisResult): RunPredictions | null {
  const found = RACE_PREDICTORS[sport]?.(result) ?? null
  return found === null || found.races.length === 0 ? null : found
}

/** A race's name, as races are named whatever the units. */
const RACE_NAME: Record<(typeof RUN_RACE_DISTANCES_M)[number], string> = {
  5_000: '5 km',
  10_000: '10 km',
  [HALF_MARATHON_M]: 'Half marathon',
  [MARATHON_M]: 'Marathon',
}

/** A race's name, or a best's: the mile is named, other distances in whole kilometres. */
export function raceName(distanceM: number): string {
  if (distanceM === METRES_PER_MILE) return 'mile'
  return RACE_NAME[distanceM as keyof typeof RACE_NAME] ?? `${Math.round(distanceM / 1000)} km`
}

/** The section's name, in its heading and in the page's "Not enough yet" list. */
export const RACE_PREDICTIONS_NAME = 'Race predictions'

/**
 * What each predictor needs before it gives a race, as the sentence the "Not enough yet" list says it in. The
 * running predictor carries a best from the mile up to a race, or reads runs with heart rate.
 */
export const RACE_PREDICTION_NEED: Partial<Record<Sport, string>> = {
  run: `Needs a best of a ${raceName(METRES_PER_MILE)} or more, or runs with heart rate`,
}

/** Where a sport's bests are all left out for their effort, what it needs; null where some are kept or none are held. */
const HARD_NEED: Partial<Record<Sport, (result: AnalysisResult) => string | null>> = {
  run: (result) => {
    const holding = result.activities.some((a) => a.sport === RUN && effortsCount(a))
    return holding && anchorRuns(result).length === 0
      ? 'Needs a hard run. Your runs on file never reached a hard heart rate, so their times are not carried to a race'
      : null
  },
}

/** What a sport's predictions need now: a hard effort where its bests were all left out for theirs, else the usual need. */
export function racePredictionNeed(sport: Sport, result: AnalysisResult): string | undefined {
  return HARD_NEED[sport]?.(result) ?? RACE_PREDICTION_NEED[sport]
}

/** Each method's name where a prediction's origin is told. */
export const METHOD_NAME: Record<PredictionMethod, string> = {
  performances: 'From your best runs',
  heartRate: 'From heart rate',
}

/** Each method in a word or two, under a predicted time. */
export const METHOD_SHORT: Record<PredictionMethod, string> = {
  performances: 'runs',
  heartRate: 'heart rate',
}

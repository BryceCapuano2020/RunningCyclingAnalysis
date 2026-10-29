import { HALF_MARATHON_M, MARATHON_M, RUN_RACE_DISTANCES_M } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
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

/** Each sport's predictor from its period's result, where it has one. */
export const RACE_PREDICTORS: Partial<Record<Sport, (result: AnalysisResult) => RunPredictions>> = {
  run: (result) => {
    const runs = result.activities.filter((activity) => activity.sport === RUN)
    return predictRunRaces({
      // A best shorter than the mile is too short to carry to a race, and a treadmill's pace is no best.
      bests: runs
        .filter(effortsCount)
        .flatMap((run) =>
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

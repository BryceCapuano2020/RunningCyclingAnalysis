import { HALF_MARATHON_M, MARATHON_M, RUN_RACE_DISTANCES_M } from '@rca/core/constants'
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
      // A best shorter than the mile is too short to carry to a race.
      bests: runs.flatMap((run) =>
        (run.distanceBests ?? []).filter((best) => best.distanceM >= METRES_PER_MILE),
      ),
      vo2max: result.runVo2max,
      weeklyM: typicalWeeklyDistance(runs),
    })
  },
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

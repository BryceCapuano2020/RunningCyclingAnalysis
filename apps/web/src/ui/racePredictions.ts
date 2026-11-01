import {
  HALF_MARATHON_M,
  MARATHON_M,
  RUN_RACE_DISTANCES_M,
  VO2MAX_MIN_RUNS,
} from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { predictRunRaces, typicalWeeklyDistance } from '@rca/core/predict'
import type { PredictionMethod, RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import { METRES_PER_MILE } from '@rca/core/units'
import { notHardWords } from './effortWords'

/** The sport the running predictor reads. */
const RUN: Sport = 'run'

/*
 * Race predictions by sport. A sport with set race distances adds its predictor here, and the sport
 * page shows its predictions with the same table; a sport without one shows none.
 */

/**
 * Whether a run's best at a distance may be carried to a race. A treadmill's pace is no best. Where the gate could judge
 * (it has heart rate and a reference), a run's best counts when the run reached a hard heart rate (its peak held at or over
 * the hard line for a couple of minutes, not a lone spike), or, for a best at a half marathon or longer, when its average
 * heart rate was high (80% of the reference or more, as even a race run at that distance averages): a long effort's average
 * sits well under its peak, and a hard long run need not have one. Otherwise an easy run's pace is carried to a race as if
 * it were a hard one: a library of easy runs predicts an easy 5 km. A run without a heart rate counts, since nothing says
 * it was easy, and so does every run where the gate could not judge (the section says the effort was not checked).
 */
function anchored(result: AnalysisResult, run: ActivitySummary, distanceM: number): boolean {
  if (!effortsCount(run)) return false
  const gate = result.effortGate[RUN]
  if (
    gate.verdict === 'unknown' ||
    !run.hasHeartRate ||
    result.heartRateSetAside.includes(run.id)
  ) {
    return true
  }
  if (gate.sessions.hard.includes(run.id)) return true
  return distanceM >= HALF_MARATHON_M && gate.sessions.endurance.includes(run.id)
}

/** The runs' bests from the mile up, and of those the ones that may be carried to a race. */
function runBests(result: AnalysisResult): { all: Bests; kept: Bests } {
  const all = result.activities.flatMap((run) =>
    run.sport !== RUN || !effortsCount(run)
      ? []
      : (run.distanceBests ?? [])
          .filter((best) => best.distanceM >= METRES_PER_MILE)
          .map((best) => ({ best, run })),
  )
  return {
    all: all.map(({ best }) => best),
    kept: all
      .filter(({ best, run }) => anchored(result, run, best.distanceM))
      .map(({ best }) => best),
  }
}

type Bests = { distanceM: number; seconds: number }[]

/** Each sport's predictor from its period's result, where it has one. */
export const RACE_PREDICTORS: Partial<Record<Sport, (result: AnalysisResult) => RunPredictions>> = {
  run: (result) => {
    const runs = result.activities.filter((activity) => activity.sport === RUN)
    return predictRunRaces({
      bests: runBests(result).kept,
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

/** The section's name, in its heading. */
export const RACE_PREDICTIONS_NAME = 'Race predictions'

/**
 * What each predictor needs before it gives a race, as the sentence the section says it in. The
 * running predictor carries a best from the mile up to a race, or reads the heart rate of outdoor runs: an estimate of VO2max
 * needs VO2MAX_MIN_RUNS of them with a reference heart rate that can be trusted, and indoor pace is left out of it.
 */
export const RACE_PREDICTION_NEED: Partial<Record<Sport, string>> = {
  run: `Needs a best of a ${raceName(METRES_PER_MILE)} or more, or ${VO2MAX_MIN_RUNS} outdoor runs with a heart rate that can be trusted`,
}

/**
 * Where a sport's bests are all left out for their effort, what it needs; null where some are kept or none are held. With
 * a reference that can be trusted a harder run of a mile or more is the answer; with one that cannot, the reference is.
 */
const HARD_NEED: Partial<Record<Sport, (result: AnalysisResult) => string | null>> = {
  run: (result) => {
    const { all, kept } = runBests(result)
    if (all.length === 0 || kept.length > 0) return null
    const gate = result.effortGate[RUN]
    return gate.neededS === null
      ? `Needs a reference heart rate that can be trusted. ${notHardWords(RUN, gate, '').action}`
      : `Needs a hard run of a ${raceName(METRES_PER_MILE)} or more. None of your runs reached a hard heart rate`
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

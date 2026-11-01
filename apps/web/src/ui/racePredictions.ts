import { HALF_MARATHON_M, MARATHON_M, RUN_RACE_DISTANCES_M } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { predictRunRaces, typicalWeeklyDistance } from '@rca/core/predict'
import type { Performance, PredictionMethod, RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import { METRES_PER_MILE } from '@rca/core/units'

/** The sport the running predictor reads. */
const RUN: Sport = 'run'

/*
 * Race predictions by sport. A sport with set race distances adds its predictor here, and the sport
 * page shows its predictions with the same table; a sport without one shows none.
 */

/** How a window's runs are judged: whether a run's best may be carried to a race. */
export interface RunJudge {
  /** The gate could not judge (no heart rate to set a reference by, or none to judge), so nothing says a run was easy. */
  unchecked: boolean
  setAside: (id: string) => boolean
  hard: (id: string) => boolean
  endurance: (id: string) => boolean
}

/** The judge of the period's own runs: the gate of its result, which reads the library's reference. */
export function periodJudge(result: AnalysisResult): RunJudge {
  const gate = result.effortGate[RUN]
  const aside = new Set(result.heartRateSetAside)
  const hard = new Set(gate.sessions.hard)
  const endurance = new Set(gate.sessions.endurance)
  return {
    unchecked: gate.verdict === 'unknown',
    setAside: (id) => aside.has(id),
    hard: (id) => hard.has(id),
    endurance: (id) => endurance.has(id),
  }
}

/** The judge of any runs of the library: its sessions, against the reference every period is judged by. */
export function libraryJudge(judgement: HeartRateJudgement): RunJudge {
  const reading = judgement.effortReference.reading[RUN]
  const aside = new Set(judgement.setAside)
  const hard = new Set(judgement.sessions[RUN].hard)
  const endurance = new Set(judgement.sessions[RUN].endurance)
  return {
    unchecked: reading === null || reading === 'thin',
    setAside: (id) => aside.has(id),
    hard: (id) => hard.has(id),
    endurance: (id) => endurance.has(id),
  }
}

/**
 * Whether a run's best at a distance may be carried to a race. A treadmill's pace is no best. Where the judge could judge
 * (it has heart rate and a reference), a run's best counts when the run reached a hard heart rate (its peak held at or over
 * the hard line for a couple of minutes, not a lone spike), or, for a best at a half marathon or longer, when its average
 * heart rate was high (80% of the reference or more, as even a race run at that distance averages): a long effort's average
 * sits well under its peak, and a hard long run need not have one. Otherwise an easy run's pace is carried to a race as if
 * it were a hard one: a library of easy runs predicts an easy 5 km. A run without a heart rate counts, since nothing says
 * it was easy, and so does every run where the judge could not judge.
 */
function anchored(judge: RunJudge, run: ActivitySummary, distanceM: number): boolean {
  if (!effortsCount(run)) return false
  if (judge.unchecked || !run.hasHeartRate || judge.setAside(run.id)) return true
  if (judge.hard(run.id)) return true
  return distanceM >= HALF_MARATHON_M && judge.endurance(run.id)
}

/** A run's best from the mile up, with the run that set it. */
export interface RunBest {
  best: Performance
  run: ActivitySummary
}

/** The runs' bests from the mile up, and of those the ones that may be carried to a race. */
export function runBests(
  runs: readonly ActivitySummary[],
  judge: RunJudge,
): { all: RunBest[]; kept: RunBest[] } {
  const all = runs.flatMap((run) =>
    run.sport !== RUN || !effortsCount(run)
      ? []
      : (run.distanceBests ?? [])
          .filter((best) => best.distanceM >= METRES_PER_MILE)
          .map((best) => ({ best, run })),
  )
  return { all, kept: all.filter(({ best, run }) => anchored(judge, run, best.distanceM)) }
}

/** Each sport's predictor from its period's result, where it has one. */
export const RACE_PREDICTORS: Partial<Record<Sport, (result: AnalysisResult) => RunPredictions>> = {
  run: (result) => {
    const runs = result.activities.filter((activity) => activity.sport === RUN)
    return predictRunRaces({
      bests: runBests(runs, periodJudge(result)).kept.map(({ best }) => best),
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
 * What a sport's predictions need when its library holds nothing to predict from: one run of a mile or more. The
 * running predictor widens from the period to the last 12 months and all time, so this is said only when none holds one.
 */
export const RACE_PREDICTION_NEED: Partial<Record<Sport, string>> = {
  run: `Needs a run of a ${raceName(METRES_PER_MILE)} or more`,
}

/** What a sport's predictions need now, or undefined for a sport without a predictor. */
export function racePredictionNeed(sport: Sport): string | undefined {
  return RACE_PREDICTION_NEED[sport]
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

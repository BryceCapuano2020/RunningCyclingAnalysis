import type { AnalysisResult } from '@rca/core/pipeline'
import type { RacePrediction } from '@rca/core/predict'
import type { HalfForecast } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { withoutWalking } from './analysis/walkingPaceCopy'
import type { SessionState } from '@rca/core/session'
import { headlineHalf, raceAnswerFor } from './raceAnswer'
import type { RaceContext } from './raceAnswer'

/**
 * The run's forecast half marathon as the grade reads it, from the half Balance's run row leads with (`headlineHalf`): its time and
 * range, with the age taken at the end of the period, or the newest activity's day for all time. Null when there is no forecast
 * (none, one carried from easy runs, or runs told as they were run): the run is then graded by its threshold everywhere.
 */
export function halfForecastOf(
  half: RacePrediction | null,
  context: Pick<RaceContext, 'result' | 'periodEndMs'>,
): HalfForecast | null {
  if (half === null) return null
  const newest = Math.max(0, ...context.result.activities.map((activity) => activity.startMs))
  return {
    seconds: half.seconds,
    low: half.low,
    high: half.high,
    atMs: context.periodEndMs ?? newest,
  }
}

/** The forecast for a page's race context, from the same `raceAnswerFor` call the Run page's predictions and Balance's row make. */
export function halfForecastFor(context: RaceContext): HalfForecast | null {
  return halfForecastOf(headlineHalf(raceAnswerFor('run', context)), context)
}

/** A result's forecast half, asked with a state's period, library and judgement: what the import notice grades each side by. */
export type HalfOf = (result: AnalysisResult) => HalfForecast | null

/** No forecast for any result: the run is graded by its threshold. */
export const NO_HALF: HalfOf = () => null

/**
 * The forecast half of any result read with the page's period, library (less the runs at walking pace) and judgement, as Balance
 * asks it, so the import notice grades the run before and after an import the way Balance does.
 */
export function halfOfState(
  state: Pick<SessionState, 'period' | 'library' | 'heartRateJudgement'>,
): HalfOf {
  const library = withoutWalking(state.library)
  return (result) =>
    halfForecastFor({
      result,
      rangeDays: state.period.days,
      library,
      heartRateJudgement: state.heartRateJudgement,
      periodEndMs: state.period.endMs,
    })
}

/** Which sports are graded by a forecast half where they have one: the run; a ride by its threshold. */
const GRADED_BY_HALF: Record<Sport, boolean> = { run: true, ride: false }

/** A sport page's forecast half for its grade: the run's (`halfForecastFor`), and none for a ride. */
export function sportHalfFor(sport: Sport, context: RaceContext): HalfForecast | null {
  return GRADED_BY_HALF[sport] ? halfForecastFor(context) : null
}

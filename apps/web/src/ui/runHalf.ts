import type { RacePrediction } from '@rca/core/predict'
import type { HalfForecast } from '@rca/core/standing'
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

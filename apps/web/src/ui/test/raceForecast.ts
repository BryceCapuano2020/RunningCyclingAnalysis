import type { RaceAnswer, RaceForecast } from '../raceAnswer'

/** The answer as a forecast, for a test that reads its predictions; fails where there is none or it is of past runs. */
export function forecastOf(answer: RaceAnswer | null): RaceForecast {
  if (answer === null || answer.kind === 'past') throw new Error('expected a forecast')
  return answer
}

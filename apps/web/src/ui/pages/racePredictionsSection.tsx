import type { ReactNode } from 'react'
import { raceAnswerOf } from '../raceAnswer'
import { RACE_PREDICTIONS_NAME, racePredictionNeed } from '../racePredictions'
import { distanceRecords } from '../records'
import { lackLine } from './lackLine'
import { RacePast } from './RacePast'
import { RacePredictions } from './RacePredictions'
import { ranBests } from './raceRan'
import type { SectionContext } from './sportPageProps'

/**
 * The race predictions section of a sport page: the card when the library can give one, from the period, else the last 12
 * months, else all time; and when it holds no run of a mile or more, the one line that says what to add.
 */
export function racePredictionsOutcome({
  sport,
  result,
  library,
  units,
  rangeDays,
  openedAt,
  heartRateJudgement,
  periodEndMs,
}: SectionContext): { content: ReactNode | null; lacks: readonly string[] } {
  const answer = raceAnswerOf(
    sport,
    result,
    rangeDays,
    heartRateJudgement === undefined
      ? undefined
      : { judgement: heartRateJudgement, library, endMs: periodEndMs ?? null },
  )
  if (answer === null) {
    const need = racePredictionNeed(sport)
    return {
      content: null,
      lacks: need === undefined ? [] : [lackLine(RACE_PREDICTIONS_NAME, need)],
    }
  }
  if (answer.kind === 'past') {
    return { content: <RacePast sport={sport} ran={answer.ran} units={units} />, lacks: [] }
  }
  const { found, window, basis, activities } = answer
  const bound = answer.kind === 'bound'
  return {
    content: (
      <RacePredictions
        sport={sport}
        found={found}
        units={units}
        // A page of all time is the best period in the files, as a window of all time is.
        window={rangeDays === null ? 'all' : window}
        bound={bound}
        basis={basis}
        openedAt={openedAt}
        ran={bound ? [] : ranBests(found, distanceRecords(activities, units).records, openedAt)}
      />
    ),
    lacks: [],
  }
}

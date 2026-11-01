import type { ReactNode } from 'react'
import { raceAnswerOf } from '../raceAnswer'
import { racePredictionNeed } from '../racePredictions'
import { distanceRecords } from '../records'
import { RacePast } from './RacePast'
import { RacePredictions } from './RacePredictions'
import { ranBests } from './raceRan'
import type { SectionContext } from './sportPageProps'

/**
 * The race predictions section of a sport page: the card when the library can give one, from the period, else the 12
 * months ending with it, else the older runs as they were run; and when it holds no run of a mile or more, no content and
 * the need, which the page says in one line in the section's place.
 */
export function racePredictionsContent({
  sport,
  result,
  library,
  units,
  rangeDays,
  openedAt,
  heartRateJudgement,
  periodEndMs,
}: SectionContext): { content: ReactNode | null; need?: string } {
  const answer = raceAnswerOf(
    sport,
    result,
    rangeDays,
    heartRateJudgement === undefined
      ? undefined
      : { judgement: heartRateJudgement, library, endMs: periodEndMs ?? null },
  )
  if (answer === null) return { content: null, need: racePredictionNeed(sport) }
  if (answer.kind === 'past') {
    return { content: <RacePast sport={sport} ran={answer.ran} units={units} /> }
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
  }
}

import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { LATE_IN_EFFORT_NAME, lateInEffort } from '../lateInEffort'
import { RACE_PREDICTIONS_NAME, RACE_PREDICTION_NEED, racePredictionsOf } from '../racePredictions'
import { BestEffortsSection } from './BestEffortsSection'
import { LateInEffortSection } from './LateInEffortSection'
import { RacePredictions } from './RacePredictions'
import { SameHeartRateSection } from './SameHeartRateSection'
import { sameHeartRateLack } from './sameHeartRateLack'
import { standOutLack } from './standOutLack'
import { WeekByWeekSection } from './WeekByWeekSection'
import { lackLine } from './lackLine'
import type { SectionContext } from './sportPageProps'

/** The sections that can follow a sport page's answer. */
export type SectionId =
  'bestEfforts' | 'racePredictions' | 'weekByWeek' | 'sameHeartRate' | 'lateInEffort'

/**
 * What a section gives the page: its content, and why part of it or all of it is missing, in plain words.
 * A section with nothing to show has no content and so no heading, and the page gathers its lack with the
 * others' in one "Not enough yet" list at the end.
 */
export interface SectionOutcome {
  content: ReactNode | null
  lack: string | null
}

/**
 * The sections of each sport's page, in the order they are read: the best efforts with the curve under
 * them, what they predict, then how they moved week by week and at the same heart rate, and how they hold
 * up late in long sessions. A sport without race predictions leaves that section out; a sport that is not measured in time names its own.
 */
export const SPORT_SECTIONS: Record<Sport, readonly SectionId[]> = {
  run: ['bestEfforts', 'racePredictions', 'weekByWeek', 'sameHeartRate', 'lateInEffort'],
  ride: ['bestEfforts', 'weekByWeek', 'sameHeartRate', 'lateInEffort'],
}

/** How each section makes its outcome from what the page worked out. */
const SECTIONS: Record<SectionId, (context: SectionContext) => SectionOutcome> = {
  // The stand-out finding is the curve's caption, so its lack is the section's while its content stays.
  bestEfforts: (context) => ({
    content: <BestEffortsSection {...context} />,
    lack: standOutLack(context.sport, context.result),
  }),
  racePredictions: ({ sport, result, units }) => {
    const found = racePredictionsOf(sport, result)
    const need = RACE_PREDICTION_NEED[sport]
    if (found !== null) {
      return { content: <RacePredictions sport={sport} found={found} units={units} />, lack: null }
    }
    return {
      content: null,
      lack: need === undefined ? null : lackLine(RACE_PREDICTIONS_NAME, need),
    }
  },
  weekByWeek: ({ sport, trends, windowDays, massKg, units }) => ({
    content: (
      <WeekByWeekSection
        sport={sport}
        trends={trends}
        windowDays={windowDays}
        massKg={massKg}
        units={units}
      />
    ),
    lack: null,
  }),
  sameHeartRate: ({ sport, sameHeartRate, units }) => {
    const lack = sameHeartRateLack(sport, sameHeartRate, units)
    return lack === null
      ? {
          content: <SameHeartRateSection sport={sport} data={sameHeartRate} units={units} />,
          lack: null,
        }
      : { content: null, lack }
  },
  // The section holds two readings, each with its own need: the page lists what is missing even beside content.
  lateInEffort: ({ sport, result, lateEvidence, units }) => {
    const { durability, drift, need } = lateInEffort(sport, lateEvidence)
    return {
      content:
        durability === null && drift === null ? null : (
          <LateInEffortSection
            sport={sport}
            evidence={lateEvidence}
            activities={result.activities}
            units={units}
          />
        ),
      lack: need === null ? null : lackLine(LATE_IN_EFFORT_NAME, need),
    }
  },
}

/** A sport's sections in reading order, each with the id the page keys it by. */
export function sectionsOf(
  sport: Sport,
  context: SectionContext,
): (SectionOutcome & { id: SectionId })[] {
  return SPORT_SECTIONS[sport].map((id) => {
    const { content, lack } = SECTIONS[id](context)
    return { id, content, lack }
  })
}

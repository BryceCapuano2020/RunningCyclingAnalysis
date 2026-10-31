import { episodeRow, leadOf, leadSentence } from '@rca/core/lookback'
import type { Lead, LookBack } from '@rca/core/lookback'
import type { FitnessBySport } from '@rca/core/fitness/types'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'

/**
 * What "Your years" says on Balance: the look-back's lead as the line, and under it the episodes the lead is not,
 * newest first, so opening the row tells more than the line and never the same thing twice. The lead is chosen against
 * what the fitness cards say now (`leadOf`), so the line cannot contradict a card.
 */
export interface YearsWords {
  lead: string
  rows: string[]
}

/** The most episodes the opened row lists; the rest are counted. */
const MOST_ROWS = 4

const SPORT_NAME: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

/** The lead of the look-back against the cards as they stand, or null when it has nothing to open on. */
export function yearsLead(lookBack: LookBack, fitness: FitnessBySport): Lead | null {
  return leadOf(lookBack, { run: fitness.run.state, ride: fitness.ride.state })
}

export function yearsWords(
  lookBack: LookBack,
  fitness: FitnessBySport,
  units: UnitSystem,
): YearsWords | null {
  const lead = yearsLead(lookBack, fitness)
  if (lead === null) return null
  const told = (['run', 'ride'] as const).flatMap((sport) => {
    const years = lookBack.sports[sport].fitness
    return years.kind === 'ok' ? [{ sport, years }] : []
  })
  // Name the sport in a row only when both have years to tell.
  const named = told.length > 1
  const all = told.flatMap(({ sport, years }) =>
    years.episodes
      .filter((episode) => !(lead.kind === 'episode' && lead.episode === episode))
      .map((episode) => ({
        episode,
        text: `${named ? `${SPORT_NAME[sport]}: ` : ''}${episodeRow(episode, lookBack.sports[sport], years)}`,
      })),
  )
  all.sort((a, b) => (b.episode.toMs ?? b.episode.fromMs) - (a.episode.toMs ?? a.episode.fromMs))
  const omitted =
    all.length - MOST_ROWS + told.reduce((total, { years }) => total + years.omittedEpisodes, 0)
  const rows = all.slice(0, MOST_ROWS).map((row) => row.text)
  if (omitted > 0) rows.push(`And ${omitted} smaller ${omitted === 1 ? 'change' : 'changes'}.`)
  return { lead: leadSentence(lead, lookBack, units), rows }
}

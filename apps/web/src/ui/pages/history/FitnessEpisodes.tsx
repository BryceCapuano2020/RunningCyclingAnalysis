import { episodeRow } from '@rca/core/lookback'
import type { LookBack } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import './FitnessEpisodes.css'

export interface FitnessEpisodesProps {
  sport: Sport
  lookBack: LookBack
}

/**
 * The slips and rises of one sport's fitness, one line each with the size of the change and the steady activities it
 * rests on, under the chart that shades them. The head is a label, not a heading: a chart's title is not one either. Nothing
 * for a sport with no episodes, and nothing is said of now: the fitness card has the last 12 weeks.
 */
export function FitnessEpisodes({ sport, lookBack }: FitnessEpisodesProps) {
  const block = lookBack.sports[sport]
  const years = block.fitness
  if (years.kind !== 'ok' || years.episodes.length === 0) return null
  const omitted = years.omittedEpisodes
  return (
    <section className="fitness-episodes" aria-label="Episodes">
      <p className="fitness-episodes__head">Episodes</p>
      <ul className="fitness-episodes__list">
        {years.episodes.map((episode) => (
          <li key={`${episode.kind}-${episode.fromMs}`}>{episodeRow(episode, block, years)}</li>
        ))}
        {omitted === 0 ? null : (
          <li>{`And ${omitted} smaller ${omitted === 1 ? 'change' : 'changes'}.`}</li>
        )}
      </ul>
    </section>
  )
}

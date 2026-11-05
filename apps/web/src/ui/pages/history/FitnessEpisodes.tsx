import { episodeRow } from '@rca/core/lookback'
import type { LookBack } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import { NumText } from '../../components/NumText'
import { RowIndex } from '../../components/RowList'
import './FitnessEpisodes.css'

export interface FitnessEpisodesProps {
  sport: Sport
  lookBack: LookBack
}

/**
 * The slips and rises of one sport's fitness as numbered rows in the sport's ink, each one sentence with the size of the
 * change and the steady activities it rests on, under the chart that shades them. Nothing for a sport with no episodes,
 * and nothing is said of now: the fitness card has the last 12 weeks.
 */
export function FitnessEpisodes({ sport, lookBack }: FitnessEpisodesProps) {
  const block = lookBack.sports[sport]
  const years = block.fitness
  if (years.kind !== 'ok' || years.episodes.length === 0) return null
  const omitted = years.omittedEpisodes
  return (
    <section className="fitness-episodes" aria-label="Episodes" data-sport={sport}>
      <ol className="rows">
        {years.episodes.map((episode, index) => (
          <li key={`${episode.kind}-${episode.fromMs}`} className="row">
            <RowIndex index={index} />
            <div className="row__body">
              <p className="fitness-episodes__text">
                <NumText text={episodeRow(episode, block, years)} />
              </p>
            </div>
          </li>
        ))}
      </ol>
      {omitted === 0 ? null : (
        <p className="fitness-episodes__more">
          <NumText text={`And ${omitted} smaller ${omitted === 1 ? 'change' : 'changes'}.`} />
        </p>
      )}
    </section>
  )
}

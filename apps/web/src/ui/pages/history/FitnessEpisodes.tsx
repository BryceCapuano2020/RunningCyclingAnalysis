import { episodeFigure } from '@rca/core/lookback'
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
 * The slips and rises of one sport's fitness as numbered label and figure rows in the sport's ink, the size of the change at the
 * right and the steady activities it rests on beneath, under the chart that shades them. Nothing for a sport with no episodes,
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
        {years.episodes.map((episode, index) => {
          const figure = episodeFigure(episode, block, years)
          return (
            <li
              key={`${episode.kind}-${episode.fromMs}`}
              className="row row--figures fitness-episodes__row"
            >
              <RowIndex index={index} />
              <div className="row__body">
                <p className="row__title">{figure.label}</p>
                <p className="fitness-episodes__span">
                  <NumText
                    text={figure.steady === '' ? figure.span : `${figure.span} · ${figure.steady}`}
                  />
                </p>
              </div>
              <p className="row__figure">{figure.value}</p>
              <span className="row__sub">{figure.then}</span>
              <span className="row__spark" />
            </li>
          )
        })}
        {omitted === 0 ? null : (
          <li className="row row--figures fitness-episodes__row">
            <span className="row__index" aria-hidden="true" />
            <div className="row__body">
              <p className="row__title">Smaller changes</p>
            </div>
            <p className="row__figure">{omitted}</p>
            <span className="row__sub" />
            <span className="row__spark" />
          </li>
        )}
      </ol>
    </section>
  )
}

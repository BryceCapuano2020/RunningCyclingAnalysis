import { bestRows, breakRow, episodeRow, quietRow, thinRow, tooShortText } from '@rca/core/lookback'
import type { LookBack } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { YearsChart } from '../charts/YearsChart'
import './YearsSection.css'

export interface YearsSectionProps {
  sport: Sport
  lookBack: LookBack
  units: UnitSystem
}

const smaller = (count: number, one: string, many: string) =>
  `${count} smaller ${count === 1 ? one : many}`

/**
 * A sport's years: the plateaus the steady runs held and the episodes between them, the stretches that were quiet or
 * had no steady runs, and the bests over the years. Every date has its year and nothing is said of now: the last 12 weeks
 * are on the fitness card. A library too short for its years says what it needs, here and nowhere else.
 */
export function YearsSection({ sport, lookBack, units }: YearsSectionProps) {
  const block = lookBack.sports[sport]
  const years = block.fitness
  return (
    <div className="years-section" data-testid="years-section">
      {years.kind === 'ok' ? (
        <>
          <YearsChart sport={sport} years={years} referenceHr={block.referenceHr} units={units} />
          {years.episodes.length === 0 ? null : (
            <section className="years-section__group" aria-label="Episodes">
              <h4 className="years-section__head">Episodes</h4>
              <ul className="years-section__list">
                {years.episodes.map((episode) => (
                  <li key={`${episode.kind}-${episode.fromMs}`}>
                    {episodeRow(episode, block, years)}
                  </li>
                ))}
                {years.omittedEpisodes === 0 ? null : (
                  <li>{`And ${smaller(years.omittedEpisodes, 'change', 'changes')}.`}</li>
                )}
              </ul>
            </section>
          )}
          {years.quiet.length + years.thin.length + years.breaks.length === 0 ? null : (
            <section className="years-section__group" aria-label="Quiet stretches">
              <h4 className="years-section__head">Quiet stretches</h4>
              <ul className="years-section__list">
                {years.quiet.map((q) => (
                  <li key={`quiet-${q.fromMs}`}>{quietRow(q, sport)}</li>
                ))}
                {years.thin.map((t) => (
                  <li key={`thin-${t.fromMs}`}>{thinRow(t)}</li>
                ))}
                {years.breaks.map((b) => (
                  <li key={`break-${b.fromMs}`}>{breakRow(b)}</li>
                ))}
                {years.omittedSpans === 0 ? null : (
                  <li>{`And ${smaller(years.omittedSpans, 'stretch', 'stretches')}.`}</li>
                )}
              </ul>
            </section>
          )}
        </>
      ) : years.kind === 'too-short' ? (
        <p className="years-section__short">{tooShortText(years)}</p>
      ) : null}
      {block.milestones.length === 0 ? null : (
        <section className="years-section__group" aria-label="Bests by year">
          <h4 className="years-section__head">Bests by year</h4>
          <ul className="years-section__list">
            {block.milestones.flatMap((m) =>
              bestRows(m, lookBack.asOfMs, units).map((row) => <li key={row}>{row}</li>),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}

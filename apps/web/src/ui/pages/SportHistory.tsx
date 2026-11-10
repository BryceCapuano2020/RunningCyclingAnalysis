import type { FitnessDots } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FitnessYearsChart } from '../charts/FitnessYearsChart'
import { NumText } from '../components/NumText'
import { anchorOf } from './sectionAnchor'

export interface SportHistoryProps {
  sport: Sport
  dots: FitnessDots
  units: UnitSystem
  /** The look-back's finding ("Slipped in 2025, then came back"), which the graph keeps as its sentence. */
  finding: string
  /** Why there is no history yet ("Not enough steady rides for a fitness history."): the strip then holds the dots alone. */
  reason?: string
  link: { href: string; text: string }
}

/**
 * A sport page's History row as a strip: the steady activities by year with the slips and rises shaded, then the link to the
 * History page that lists them. A sport too short for its years keeps the same axes with the dots it has, and says what it lacks.
 */
export function SportHistory({ sport, dots, units, finding, reason, link }: SportHistoryProps) {
  const anchor = anchorOf(sport, 'years')
  return (
    <section className="section" data-sport={sport} aria-labelledby={`${anchor}-title`}>
      <h2 id={`${anchor}-title`}>History</h2>
      <FitnessYearsChart
        sport={sport}
        dots={dots}
        units={units}
        title="History"
        titleHidden
        lede={finding}
        compact
      />
      <p className="muted">
        {reason === undefined ? null : (
          <>
            <NumText text={reason} />{' '}
          </>
        )}
        <a href={link.href}>{link.text}</a>
      </p>
    </section>
  )
}

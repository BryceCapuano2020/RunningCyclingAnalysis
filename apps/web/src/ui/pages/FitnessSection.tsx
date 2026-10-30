import { useId, useMemo } from 'react'
import type { FitnessBySport } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { fitnessViews } from '../fitnessModel'
import { FitnessCard } from './FitnessCard'
import './FitnessCard.css'

export interface FitnessSectionProps {
  fitness: FitnessBySport
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** The sport a page is about, which shows only its own status; the home page shows every sport that has one. */
  sport?: Sport
}

/**
 * "Your fitness": each sport's status at the same heart rate, as cards, run first. A sport with nothing to say
 * has none (a library with no steady run, or no ride with a power meter), and with no card the section is not
 * drawn.
 */
export function FitnessSection({ fitness, units, library, sport }: FitnessSectionProps) {
  const id = useId()
  // Made once for a status: the library-wide status does not move with the period, so a period switch repeats nothing.
  const views = useMemo(
    () =>
      fitnessViews(fitness, units).filter((view) => sport === undefined || view.sport === sport),
    [fitness, units, sport],
  )
  if (views.length === 0) return null
  return (
    <section className="fitness-section" aria-labelledby={id} data-testid="fitness-section">
      {/* Not a heading either: on Balance the page's h1 follows, and the region is named by this line. */}
      <p id={id} className="eyebrow">
        Your fitness
      </p>
      <div className="fitness-section__cards">
        {views.map((view) => (
          <FitnessCard
            key={view.sport}
            view={view}
            units={units}
            library={library}
            showSport={sport === undefined}
          />
        ))}
      </div>
    </section>
  )
}

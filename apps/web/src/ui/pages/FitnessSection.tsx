import { useId, useMemo } from 'react'
import type { FitnessBySport } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { useHoldInputs } from '../holdContext'
import { fitnessViews } from '../fitnessModel'
import type { FitnessView } from '../fitnessModel'
import { FitnessCard } from './FitnessCard'
import './FitnessCard.css'
import './FitnessSection.css'

const isWaitingRide = (view: FitnessView) =>
  view.sport === 'ride' && view.state === 'not-enough-evidence'

/**
 * What a waiting ride says on the home page, by what it waits for: a count it is short of ("not enough steady rides yet,
 * 7 of 12"), or, with enough rides, a level too uncertain to call ("too uncertain to call yet").
 */
function waitingLine({ progress, status }: FitnessView): string {
  const shortfall = status.shortfall
  const kind = shortfall?.kind
  if (kind === 'imprecise') return 'Ride fitness: too uncertain to call yet'
  if (shortfall?.kind === 'break') {
    return `Ride fitness: no steady ride for ${shortfall.weeksSince} weeks`
  }
  const recent = kind === 'recent' ? 'recent ' : ''
  const count = progress === null ? '' : `, ${progress.have} of ${progress.need}`
  return `Ride fitness: not enough ${recent}steady rides yet${count}`
}

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
 * drawn. While an import is known partial, the section says so and shows no card (the same hold as the headline's).
 */
export function FitnessSection({ fitness, units, library, sport }: FitnessSectionProps) {
  const id = useId()
  // A library known to be only part of what was added says nothing of fitness: the runs that were not read are the ones it would rest on.
  const partial = useHoldInputs().partialImport
  // Made once for a status: the library-wide status does not move with the period, so a period switch repeats nothing.
  const views = useMemo(
    () =>
      fitnessViews(fitness, units).filter((view) => sport === undefined || view.sport === sport),
    [fitness, units, sport],
  )
  // On the home page a ride that is still waiting on its count is one line, not a card of its own: the full card is on the Ride page.
  const waitingRide = sport === undefined ? views.find(isWaitingRide) : undefined
  const cards = views.filter((view) => view !== waitingRide)
  if (cards.length === 0 && waitingRide === undefined) return null
  if (partial !== undefined && partial !== null) {
    return (
      <section className="band fitness-section" aria-labelledby={id} data-testid="fitness-section">
        <p id={id} className="eyebrow">
          Your fitness
        </p>
        <p className="fitness-section__line" data-testid="fitness-held">
          {`${partial.text} ${partial.action}`}
        </p>
      </section>
    )
  }
  return (
    <section className="band fitness-section" aria-labelledby={id} data-testid="fitness-section">
      {/* Not a heading either: on Balance the page's h1 follows, and the region is named by this line. */}
      <p id={id} className="eyebrow">
        Your fitness
      </p>
      {cards.length === 0 ? null : (
        <div className="fitness-section__cards">
          {cards.map((view) => (
            <FitnessCard
              key={view.sport}
              view={view}
              units={units}
              library={library}
              showSport={sport === undefined}
            />
          ))}
        </div>
      )}
      {waitingRide === undefined ? null : (
        <p className="fitness-section__line" data-testid="ride-fitness-line">
          <a href="#/ride">{waitingLine(waitingRide)}</a>
        </p>
      )}
    </section>
  )
}

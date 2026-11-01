import { useId, useMemo, useState } from 'react'
import type { FitnessBySport } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'
import { SPORTS } from '@rca/core/types'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { useHoldInputs } from '../holdContext'
import { fitnessViews, lineOf } from '../fitnessModel'
import { FITNESS_LACK_INDOOR_LINE, FITNESS_LACK_LINE } from '../fitnessWords'
import { indoorCount } from '../indoorCopy'
import type { FitnessView } from '../fitnessModel'
import { hrefFor } from '../route'
import { FitnessCard } from './FitnessCard'
import './FitnessCard.css'
import './FitnessSection.css'

const isWaiting = (view: FitnessView) => view.state === 'not-enough-evidence'

/**
 * A sport with no level to tell (fewer than 3 steady activities) is one line, not a card. So is a sport after the first
 * (the ride) that cannot call a trend yet on the home page, which tells its level there and holds its full card on its own page.
 */
const isLine = (view: FitnessView, home: boolean) =>
  isWaiting(view) && (view.status.level === undefined || (home && SPORTS.indexOf(view.sport) > 0))

export interface FitnessSectionProps {
  fitness: FitnessBySport
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** The sport a page is about, which shows only its own status; the home page shows every sport that has one. */
  sport?: Sport
  /** The one sport a library holds: with no status for it, one quiet line says what would give one. */
  soleSport?: Sport | null
  /** Today, which the section reads once when it opens: the statuses are as of the newest activity, and this dates how new and how old they read. Given by tests. */
  nowMs?: number
}

/**
 * "Your fitness": each sport's status at the same heart rate, as cards, run first. A sport with nothing to say
 * has none (a library with no steady run, or no ride with a power meter), and with no card the section is not
 * drawn. A sport with fewer than 3 steady activities is a line. While an import is known partial, the section says so
 * and shows no card (the same hold as the headline's).
 */
export function FitnessSection({
  fitness,
  units,
  library,
  sport,
  soleSport = null,
  nowMs,
}: FitnessSectionProps) {
  const id = useId()
  // Read once, so a later render does not move what is new.
  const [openedAt] = useState(() => Date.now())
  const today = nowMs ?? openedAt
  // A library known to be only part of what was added says nothing of fitness: the runs that were not read are the ones it would rest on.
  const partial = useHoldInputs().partialImport
  // Made once for a status: the library-wide status does not move with the period, so a period switch repeats nothing.
  const views = useMemo(
    () =>
      fitnessViews(fitness, units, today).filter(
        (view) => sport === undefined || view.sport === sport,
      ),
    [fitness, units, sport, today],
  )
  const home = sport === undefined
  const lines = views.filter((view) => isLine(view, home))
  const cards = views.filter((view) => !lines.includes(view))
  if (cards.length === 0 && lines.length === 0) {
    // A line, not a card: it says what would produce a status, and is gone once there is one.
    if (soleSport === null) return null
    // Every activity of the sport indoors: heart rate is not what is missing.
    const { indoor, total } = indoorCount(library, soleSport)
    const line =
      (indoor === total ? FITNESS_LACK_INDOOR_LINE[soleSport] : undefined) ??
      FITNESS_LACK_LINE[soleSport]
    return (
      <p className="fitness-section__line" data-testid="fitness-lack-line">
        {line}
      </p>
    )
  }
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
      {lines.map((view) => (
        <p
          key={view.sport}
          className="fitness-section__line"
          data-testid={`${view.sport}-fitness-line`}
        >
          {home ? <a href={hrefFor({ page: view.sport })}>{lineOf(view)}</a> : lineOf(view)}
        </p>
      ))}
    </section>
  )
}

import { useId, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { useHoldInputs } from '../holdContext'
import { SPORT_LABEL } from '../sports'
import { adjustedForWarmDays } from '../fitnessModel'
import type { FitnessView } from '../fitnessModel'
import { withDefinitions } from '../fitnessText'
import { FitnessEvidence } from './FitnessEvidence'
import { FitnessTrack } from './FitnessTrack'
import './FitnessCard.css'
import { NumText } from '../components/NumText'

export interface FitnessCardProps {
  view: FitnessView
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** Names the sport at the card's top. A sport's own page leaves it out: its title says it. */
  showSport?: boolean
}

/**
 * One sport's fitness at the same effort: the state as a word, the sentence that gives its size and range, the change
 * as a track, and the evidence behind a disclosure. A status that cannot call a trend gives its
 * level and what a trend needs in place of the sentence and the track. A state
 * that began to be shown in the last few weeks wears a "New" marker with the week it began.
 */
export function FitnessCard({ view, units, library, showSport = true }: FitnessCardProps) {
  const id = useId()
  const [mounted, setMounted] = useState(false)
  const partial = useHoldInputs().partialImport
  const { status } = view
  const waiting = view.state === 'not-enough-evidence'
  const warm = !waiting && adjustedForWarmDays(status)
  const evidenceOf = view.status.evidence !== null && view.status.series.length > 1
  // Held with the headline: a library known to be only part of what was added gives no state to show.
  if (partial !== undefined && partial !== null) {
    return (
      <article
        className="fitness-card"
        data-sport={view.sport}
        data-state="held"
        aria-labelledby={`${id}-state`}
      >
        {showSport ? (
          <header className="fitness-card__top">
            <p className="meta fitness-card__sport">{SPORT_LABEL[view.sport]}</p>
          </header>
        ) : null}
        <p id={`${id}-state`} className="fitness-card__state">
          Held
        </p>
        <p className="fitness-card__headline" data-testid="fitness-held">
          {`${partial.text} ${partial.action}`}
        </p>
      </article>
    )
  }
  return (
    <article
      className="fitness-card"
      data-sport={view.sport}
      data-state={view.state}
      aria-labelledby={`${id}-state`}
    >
      {showSport || view.fresh !== null ? (
        <header className="fitness-card__top">
          {showSport ? (
            <p className="meta fitness-card__sport">{SPORT_LABEL[view.sport]}</p>
          ) : (
            <span />
          )}
          {view.fresh === null ? null : (
            <p className="meta fitness-card__new" data-testid="fitness-new">
              New <span className="fitness-card__new-week">{`since ${view.fresh}`}</span>
            </p>
          )}
        </header>
      ) : null}
      <div className="fitness-card__body">
        <div className="fitness-card__text">
          {/* Not a heading: the page's own title comes first, and the card is named by its state. */}
          <p id={`${id}-state`} className="fitness-card__state">
            {view.label}
          </p>
          <p className="fitness-card__headline">{withDefinitions(view.headline, status, units)}</p>
          {view.changes.map((line) => (
            <p key={line} className="fitness-card__change" data-testid="fitness-change">
              {withDefinitions(line, status, units)}
            </p>
          ))}
          {view.support === '' ? null : (
            <p className="fitness-card__support">{withDefinitions(view.support, status, units)}</p>
          )}
          {view.age === null ? null : (
            <p className="fitness-card__support" data-testid="fitness-age">
              <NumText text={view.age} />
            </p>
          )}
          {view.needs === '' ? null : (
            <p className="fitness-card__support" data-testid="fitness-needs">
              <NumText text={view.needs} />
            </p>
          )}
          {warm ? (
            <p className="fitness-card__support" data-testid="fitness-heat">
              Adjusted for warm days.
            </p>
          ) : null}
        </div>
        {view.track === null ? null : (
          <div className="fitness-card__shape">
            <FitnessTrack track={view.track} />
          </div>
        )}
      </div>
      {waiting || !evidenceOf ? null : (
        <details
          className="disclosure fitness-card__evidence"
          onToggle={(event) => {
            if (event.currentTarget.open) setMounted(true)
          }}
        >
          <summary>
            <span>See the evidence</span>
            {/* Two cards on Balance: a control list needs to tell them apart. */}
            {showSport ? (
              <span className="sr-only">{` for ${SPORT_LABEL[view.sport].toLowerCase()}`}</span>
            ) : null}
          </summary>
          {mounted ? <FitnessEvidence status={status} units={units} library={library} /> : null}
        </details>
      )}
    </article>
  )
}

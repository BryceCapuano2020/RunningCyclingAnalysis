import { useId, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { SportIcon } from '../components/icons'
import { useHoldInputs } from '../holdContext'
import { SPORT_LABEL } from '../sports'
import { adjustedForWarmDays, seasonSwing } from '../fitnessModel'
import type { FitnessProgress, FitnessView } from '../fitnessModel'
import { FITNESS_WORDS } from '../fitnessWords'
import { withDefinitions } from '../fitnessText'
import { FitnessEvidence } from './FitnessEvidence'
import { FitnessGlyph } from './FitnessGlyph'
import { FitnessTrack } from './FitnessTrack'
import './FitnessCard.css'

/** A waiting status's count as a row of pills, one for each steady run it needs, filled for each it has. */
function Progress({ progress }: { progress: FitnessProgress }) {
  const cells = Math.min(progress.need, 24)
  const filled = Math.min(progress.have, progress.need)
  return (
    <div className="fitness-progress">
      <div className="fitness-progress__cells" aria-hidden="true">
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            className={i < filled ? 'fitness-progress__cell is-on' : 'fitness-progress__cell'}
          />
        ))}
      </div>
      <p className="fitness-progress__count">
        <strong>{`${progress.have} of ${progress.need}`}</strong>
        {` ${progress.of}`}
      </p>
    </div>
  )
}

export interface FitnessCardProps {
  view: FitnessView
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** Names the sport at the card's top. A sport's own page leaves it out: its title says it. */
  showSport?: boolean
}

/**
 * One sport's fitness at the same effort: the state as a word and a shape, the sentence that gives its size and
 * range, the change as a track (or the count it is waiting on), and the evidence behind a disclosure. A state
 * that began to be shown in the last few weeks wears a "New" marker with the week it began.
 */
export function FitnessCard({ view, units, library, showSport = true }: FitnessCardProps) {
  const id = useId()
  const [mounted, setMounted] = useState(false)
  const partial = useHoldInputs().partialImport
  const { status } = view
  const waiting = view.state === 'not-enough-evidence'
  const seasonal = waiting ? null : seasonSwing(status)
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
            <p className="fitness-card__sport">
              <SportIcon sport={view.sport} />
              <span>{SPORT_LABEL[view.sport]}</span>
            </p>
          </header>
        ) : null}
        <p id={`${id}-state`} className="display fitness-card__state">
          <span>Held</span>
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
            <p className="tag tag--ink fitness-card__sport">
              <SportIcon sport={view.sport} />
              <span>{SPORT_LABEL[view.sport]}</span>
            </p>
          ) : (
            <span />
          )}
          {view.fresh === null ? null : (
            <p className="fitness-card__new" data-testid="fitness-new">
              <strong>New</strong>
              <span className="fitness-card__new-week">{`since ${view.fresh}`}</span>
            </p>
          )}
        </header>
      ) : null}
      <div className="fitness-card__body">
        <div className="fitness-card__text">
          {/* Not a heading: the page's own title comes first, and the card is named by its state. */}
          <p id={`${id}-state`} className="display fitness-card__state">
            <FitnessGlyph glyph={view.glyph} />
            <span>{view.label}</span>
          </p>
          <p className="fitness-card__headline">{withDefinitions(view.headline, status, units)}</p>
          {view.support === '' ? null : (
            <p className="fitness-card__support">{withDefinitions(view.support, status, units)}</p>
          )}
          {warm ? (
            <p className="fitness-card__support" data-testid="fitness-heat">
              Adjusted for warm days.
            </p>
          ) : null}
          {seasonal === null ? null : (
            <p className="fitness-card__support" data-testid="fitness-season">
              {`Allowing for your usual seasonal swing, ${seasonal}.`}
            </p>
          )}
        </div>
        <div className="fitness-card__shape">
          {view.track !== null ? <FitnessTrack track={view.track} /> : null}
          {view.progress !== null ? <Progress progress={view.progress} /> : null}
        </div>
      </div>
      {waiting || !evidenceOf ? null : (
        <details
          className="fitness-card__evidence"
          onToggle={(event) => {
            if (event.currentTarget.open) setMounted(true)
          }}
        >
          <summary>
            <span>See the evidence</span>
            <span className="sr-only">{` for your ${FITNESS_WORDS[view.sport].output.toLowerCase()} at the same heart rate`}</span>
          </summary>
          {mounted ? <FitnessEvidence status={status} units={units} library={library} /> : null}
        </details>
      )}
    </article>
  )
}

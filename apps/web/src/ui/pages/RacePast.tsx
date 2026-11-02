import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace } from '@rca/core/units'
import type { PastRun } from '../raceAnswer'
import { RACE_PREDICTIONS_NAME, raceName } from '../racePredictions'
import { PAST_LINE, pastText } from './racePredictionCopy'
import './RacePredictions.css'

/**
 * The race card when every run of a mile or more is older than 12 months: each distance as it was run and when, with no
 * range, no forecast and no claim of what the athlete runs now.
 */
export function RacePast({
  sport,
  ran,
  units,
}: {
  sport: Sport
  ran: readonly PastRun[]
  units: UnitSystem
}) {
  const headingId = `${sport}-races`
  return (
    <section className="section race-predictions" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{RACE_PREDICTIONS_NAME}</h2>
        <p className="secondary">{PAST_LINE}</p>
      </div>
      <ul className="race-rows">
        {ran.map((run) => (
          <li key={run.distanceM} className="race-row">
            <p className="race-row__name">
              <span className="race-row__race">{raceName(run.distanceM)}</span>
              <span className="race-row__pace">
                {formatPace(run.distanceM / run.seconds, units)}
              </span>
              <span className="race-row__ran">{pastText(run)}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { EQUIVALENCE_MIN_S } from '@rca/core/constants'
import { PACE_UNIT, formatDuration, formatPaceValue, formatPower } from '@rca/core/units'
import { EquivalenceTable } from '../components'
import { WeightNote } from '../components/WeightNote'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { formatDayMonth } from '../format/date'
import { PER } from '../format/units'
import { hrefFor } from '../route'
import { countSport, featuredEquivalence, isEstimatedRecord } from '../records'
import { betweenClause } from '../periodCopy'
import './CrossSportCard.css'

export interface CrossSportCardProps {
  result: AnalysisResult
  units: UnitSystem
  /** False while no body weight is entered: the ride's figures then wait for it. */
  weighted: boolean
  /** The period on screen, whose dates the needs-a-ride line names. */
  period: Period
}

/** The activity that set the best ride effort at durationS, or null when it is not in the result. */
function rideAt(result: AnalysisResult, durationS: number): ActivitySummary | null {
  const id = result.rideCurve.find((point) => point.durationS === durationS)?.activityId
  return result.activities.find((activity) => activity.id === id) ?? null
}

/** The line for a ride too short to compare: the duration, and the dates it is missing between. */
function needsRideText(period: Period): string {
  const when = betweenClause(period)
  return `Needs a ride of ${formatDuration(EQUIVALENCE_MIN_S)} or more${when === '' ? '' : ` ${when}`}.`
}

/**
 * What your ride fitness is worth on foot: the app's most relatable idea, as a headline, with a
 * glyph pair that shows ride becoming run. It names the ride that set the effort, tags its watts
 * estimated when no power meter measured them, and opens to every duration. A file with no ride has
 * no such idea, so the slot is left out; without a weight the ride's figures wait for it.
 */
export function CrossSportCard({ result, units, weighted, period }: CrossSportCardProps) {
  if (countSport(result.activities, 'ride') === 0) return null
  if (!weighted) {
    return (
      <section className="cross-sport" aria-labelledby="cross-sport-card">
        <span className="chip">Across sports</span>
        <h2 id="cross-sport-card">Your ride on foot</h2>
        <WeightNote />
      </section>
    )
  }
  const featured = featuredEquivalence(result.equivalents)
  if (!featured || !(featured.runSpeed.p50 > 0 && Number.isFinite(featured.runSpeed.p50))) {
    return (
      <section className="cross-sport" aria-labelledby="cross-sport-card">
        <h2 id="cross-sport-card">Your ride on foot</h2>
        <p className="secondary">{needsRideText(period)}</p>
      </section>
    )
  }
  const paceNumber = formatPaceValue(featured.runSpeed.p50, units)
  const source = rideAt(result, featured.durationS)
  const watts = `${formatPower(featured.ridePowerW)}${isEstimatedRecord('ride', source) ? ' (estimated)' : ''}`
  return (
    <section className="cross-sport" aria-labelledby="cross-sport-card">
      <span className="chip">Across sports</span>
      <p className="cross-sport__pair" aria-hidden="true">
        <SportIcon sport="ride" />
        <ArrowRightIcon />
        <SportIcon sport="run" />
      </p>
      <h2 id="cross-sport-card">
        {`On foot, your ride is worth ${paceNumber}`}{' '}
        {/* The unit is set apart, so the upper-case heading does not turn it into capitals. */}
        <span className="unit">{PACE_UNIT[units]}</span>
      </h2>
      <p className="secondary">
        {`Your best ${formatDuration(featured.durationS)} on the bike, ${watts}, takes the same effort as running ${paceNumber} ${PER[units]} on the flat.`}
      </p>
      {source && (
        <p>
          <a className="cross-sport__link" href={hrefFor({ page: 'activity', id: source.id })}>
            {`Set on ${source.name}, ${formatDayMonth(source.startMs)}`}
          </a>
        </p>
      )}
      <details className="cross-sport__details">
        <summary>See the pace curve</summary>
        <EquivalenceTable
          equivalents={result.equivalents}
          units={units}
          weighted={weighted}
          estimated={(durationS) => isEstimatedRecord('ride', rideAt(result, durationS))}
        />
      </details>
    </section>
  )
}

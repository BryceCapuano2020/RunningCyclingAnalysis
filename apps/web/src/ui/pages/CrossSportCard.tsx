import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { EQUIVALENCE_MIN_S } from '@rca/core/constants'
import { formatDuration, formatPace, formatPaceValue, formatPower } from '@rca/core/units'
import { EquivalenceTable } from '../components'
import { WeightNote } from '../components/WeightNote'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { formatDay } from '../format/date'
import { PER } from '../format/units'
import { hrefFor } from '../route'
import { countSport, featuredEquivalence, isEstimatedRecord } from '../records'
import './CrossSportCard.css'

export interface CrossSportCardProps {
  result: AnalysisResult
  units: UnitSystem
  /** False while no body weight is entered: the ride's figures then wait for it. */
  weighted: boolean
}

/** The activity that set the best ride effort at durationS, or null when it is not in the result. */
function rideAt(result: AnalysisResult, durationS: number): ActivitySummary | null {
  const id = result.rideCurve.find((point) => point.durationS === durationS)?.activityId
  return result.activities.find((activity) => activity.id === id) ?? null
}

/**
 * What your ride fitness is worth on foot: the app's most relatable idea, as a headline, with a
 * glyph pair that shows ride becoming run. It names the ride that set the effort, tags its watts
 * estimated when no power meter measured them, and opens to every duration. A file with no ride has
 * no such idea, so the slot is left out; without a weight the ride's figures wait for it.
 */
export function CrossSportCard({ result, units, weighted }: CrossSportCardProps) {
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
        <p className="secondary">{`Needs a ride of ${formatDuration(EQUIVALENCE_MIN_S)} or more.`}</p>
      </section>
    )
  }
  const pace = formatPace(featured.runSpeed.p50, units)
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
      <h2 id="cross-sport-card">{`On foot, your ride is worth ${pace}`}</h2>
      <p className="secondary">
        {`Your best ${formatDuration(featured.durationS)} on the bike, ${watts}, takes the same effort as running ${paceNumber} ${PER[units]} on the flat.`}
      </p>
      {source && (
        <p>
          <a href={hrefFor({ page: 'activity', id: source.id })}>
            {`Set on ${source.name}, ${formatDay(source.startMs)}`}
          </a>
        </p>
      )}
      <details className="cross-sport__details">
        <summary>See every duration</summary>
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

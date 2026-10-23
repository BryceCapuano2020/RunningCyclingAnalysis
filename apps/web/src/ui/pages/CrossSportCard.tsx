import type { AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPace, formatPaceValue, formatPower } from '@rca/core/units'
import { EquivalenceTable } from '../components'
import { formatDay } from '../format/date'
import { hrefFor } from '../route'
import { featuredEquivalence } from '../records'

export interface CrossSportCardProps {
  result: AnalysisResult
  units: UnitSystem
}

const PER: Record<UnitSystem, string> = { imperial: 'per mile', metric: 'per kilometre' }

/**
 * What your bike fitness is worth on foot: the app's most relatable idea, as a headline. It names
 * the ride that set the effort, and opens to every duration.
 */
export function CrossSportCard({ result, units }: CrossSportCardProps) {
  const featured = featuredEquivalence(result.equivalents)
  if (!featured || !(featured.runSpeed.p50 > 0 && Number.isFinite(featured.runSpeed.p50))) {
    return (
      <section className="section" aria-labelledby="cross-sport-card">
        <h2 id="cross-sport-card">Your bike on foot</h2>
        <p className="secondary">Needs a ride of five minutes or more.</p>
      </section>
    )
  }
  const pace = formatPace(featured.runSpeed.p50, units)
  const paceNumber = formatPaceValue(featured.runSpeed.p50, units)
  const sourceId = result.rideCurve.find((p) => p.durationS === featured.durationS)?.activityId
  const source = result.activities.find((activity) => activity.id === sourceId)
  return (
    <section className="card" aria-labelledby="cross-sport-card">
      <span className="chip">Cross-sport</span>
      <h2 id="cross-sport-card">{`On foot, your bike is worth ${pace}`}</h2>
      <p className="secondary">
        {`Your best ${formatDuration(featured.durationS)} on the bike, ${formatPower(featured.ridePowerW)}, uses the same energy as running ${paceNumber} ${PER[units]} on the flat.`}
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
        <EquivalenceTable equivalents={result.equivalents} units={units} />
      </details>
    </section>
  )
}

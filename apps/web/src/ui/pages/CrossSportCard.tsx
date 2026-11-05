import type { AnalysisResult } from '@rca/core/pipeline'
import { ridePowerAt } from '@rca/core/display'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatPaceValue, formatPower } from '@rca/core/units'
import { EquivalenceTable } from '../components'
import { WeightNote } from '../components/WeightNote'
import { StatTile } from './StatTile'
import { standingOf } from '../standing'
import { countSport, isEstimatedRecord } from '../records'
import { thresholdEstimate } from '../thresholdEstimate'
import { thresholdNeedsLine } from '../thresholdNeeds'
import './CrossSportCard.css'

export interface CrossSportCardProps {
  result: AnalysisResult
  units: UnitSystem
  /** False while no body weight is entered: the ride's figures then wait for it. */
  weighted: boolean
  /** Today's body mass, kg, which the ride threshold's watts are stated at. */
  massKg: number
}

/** The activity that set the best ride effort at durationS, or null when it is not in the result. */
function rideAt(result: AnalysisResult, durationS: number) {
  const id = result.rideCurve.find((point) => point.durationS === durationS)?.activityId
  return result.activities.find((activity) => activity.id === id) ?? null
}

/** The tile's name: the ride, priced as the run it equals. */
const HEADING = 'Your ride as a run'

/**
 * What your ride is worth as a run: the app's most relatable idea, as a tile. Its figure is the pace your ride threshold equals,
 * the hour of riding it stands for priced as an hour of running, so it sits beside the run threshold like for like: where the
 * balance leans toward running the pace is slower than the run threshold, and where it leans toward cycling, faster. The line
 * under it names the ride threshold in watts. It opens to every duration's pace, from the best efforts. It does not say how the
 * watts were found: the ride threshold's own tile says how many rides it rests on, and the pace-curve table marks each estimated
 * effort. A file with no ride has no such idea, so the slot is left out; without a weight the ride's figures wait for it.
 */
export function CrossSportCard({ result, units, weighted, massKg }: CrossSportCardProps) {
  if (countSport(result.activities, 'ride') === 0) return null
  if (!weighted) {
    return (
      <StatTile heading={HEADING}>
        <WeightNote />
      </StatTile>
    )
  }
  const estimate = thresholdEstimate(result, 'ride')
  // The pace is core's standing of the ride threshold as a run: the same figure the lean and the grade are worked from.
  const speed = standingOf(result, null).rideAsRun?.p50
  if (estimate === null || !(speed !== undefined && speed > 0 && Number.isFinite(speed))) {
    return (
      <StatTile heading={HEADING}>
        <p className="stat-tile__line">{thresholdNeedsLine(result, 'ride')}</p>
      </StatTile>
    )
  }
  const { watts } = ridePowerAt(estimate.value, massKg)
  return (
    <StatTile
      sport="ride"
      heading={HEADING}
      figure={{ number: formatPaceValue(speed, units), unit: PACE_UNIT[units] }}
    >
      <p className="stat-tile__line">{`From your ${formatPower(watts)} threshold.`}</p>
      <details className="disclosure cross-sport__details">
        <summary>See the pace curve</summary>
        <EquivalenceTable
          equivalents={result.equivalents}
          units={units}
          weighted={weighted}
          estimated={(durationS) => isEstimatedRecord('ride', rideAt(result, durationS))}
        />
      </details>
    </StatTile>
  )
}

import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { EQUIVALENCE_MIN_S, HEADLINE_DURATION_S } from '@rca/core/constants'
import { PACE_UNIT, formatDuration, formatPaceValue, formatPower } from '@rca/core/units'
import { EquivalenceTable } from '../components'
import { effortChipText } from '../effortCaveat'
import { EffortChip } from './EffortChip'
import { WeightNote } from '../components/WeightNote'
import { StatTile } from './StatTile'
import { formatDayMonth } from '../format/date'
import { hrefFor } from '../route'
import { countSport, effortLabel, featuredEquivalence, isEstimatedRecord } from '../records'
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

/** Whether a ride lasts as long as an equivalence needs, so it could have a power curve to compare. */
function hasLongRide(result: AnalysisResult): boolean {
  return result.activities.some(
    (activity) => activity.sport === 'ride' && activity.durationS >= EQUIVALENCE_MIN_S,
  )
}

/**
 * The shortest estimated ride effort the pace as a run is told from: an estimate of watts over a few minutes is too
 * loose to price as a pace, so a ride that short, with no power meter, is asked for a longer one instead.
 */
export const ESTIMATED_EQUIVALENCE_MIN_S = 600

/**
 * The line for a ride that cannot be compared yet: the duration it needs, the dates it is missing
 * between, and "with power" when a ride is long enough but has no power curve to read.
 */
function needsRideText(period: Period, withPower: boolean, minS = EQUIVALENCE_MIN_S): string {
  const when = betweenClause(period)
  const need = `Needs a ride of ${formatDuration(minS)} or more${withPower ? ' with power' : ''}`
  return `${need}${when === '' ? '' : ` ${when}`}.`
}

/** The tile's name: the ride, priced as the run it equals. */
const HEADING = 'Your ride as a run'

/**
 * What your ride is worth as a run: the app's most relatable idea, as a tile. Its figure is the pace the best 20
 * minutes on the bike equals, with the watts under it. It names the ride that set the effort, tags its watts
 * estimated when no power meter measured them, and opens to every duration. A file with no ride has no such idea,
 * so the slot is left out; without a weight the ride's figures wait for it.
 */
export function CrossSportCard({ result, units, weighted, period }: CrossSportCardProps) {
  if (countSport(result.activities, 'ride') === 0) return null
  if (!weighted) {
    return (
      <StatTile heading={HEADING}>
        <WeightNote />
      </StatTile>
    )
  }
  const featured = featuredEquivalence(result.equivalents)
  if (!featured || !(featured.runSpeed.p50 > 0 && Number.isFinite(featured.runSpeed.p50))) {
    return (
      <StatTile heading={HEADING}>
        <p className="stat-tile__line">
          {needsRideText(period, featured === null && hasLongRide(result))}
        </p>
      </StatTile>
    )
  }
  const source = rideAt(result, featured.durationS)
  const estimated = isEstimatedRecord('ride', source)
  if (estimated && featured.durationS < ESTIMATED_EQUIVALENCE_MIN_S) {
    return (
      <StatTile heading={HEADING}>
        <p className="stat-tile__line">
          {needsRideText(period, false, ESTIMATED_EQUIVALENCE_MIN_S)}
        </p>
      </StatTile>
    )
  }
  const paceNumber = formatPaceValue(featured.runSpeed.p50, units)
  const duration = effortLabel(featured.durationS)
  // The ride's own tile beside this card says how hard the best 20 minutes was, so this card says it only for the
  // other length its pace can be of, and only when that effort was not shown to be hard.
  const found =
    featured.durationS === HEADLINE_DURATION_S
      ? null
      : effortChipText(
          'ride',
          result.effort.find((check) => check.durationS === featured.durationS),
        )
  const chip = found !== null && !found.hard ? found : null
  return (
    <StatTile
      sport="ride"
      heading={HEADING}
      figure={{ number: paceNumber, unit: PACE_UNIT[units] }}
    >
      <p className="stat-tile__line">
        {`${formatPower(featured.ridePowerW)} for ${duration}${estimated ? ' (estimated)' : ''}.`}
      </p>
      {chip === null ? null : (
        <p className="stat-tile__effort">
          <EffortChip chip={chip} />
        </p>
      )}
      {source && (
        <p className="stat-tile__line">
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
    </StatTile>
  )
}

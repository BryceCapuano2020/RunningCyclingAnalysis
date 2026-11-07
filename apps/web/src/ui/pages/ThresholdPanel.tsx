import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { threshold } from '../records'
import { THRESHOLD_HEADING } from '../sports'
import { thresholdProperties } from '../thresholdBasis'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { ThresholdBasis } from './ThresholdBasis'

/**
 * The threshold, as the page's answer: its name, the figure in mono at --display-1, and under it the meta line that says
 * what it rests on, with how it was worked out behind a disclosure. It is one number for a run as for a ride, with no chip and no range beside it,
 * since the name says it is a threshold; its range, the method and what heart rate did are in the detail. With no effort its
 * estimate reads (3 min for a ride, 8 for a run), the place says what to add.
 */
export function ThresholdPanel({
  sport,
  result,
  massKg,
  units,
}: {
  sport: Sport
  result: AnalysisResult
  massKg: number
  units: UnitSystem
}) {
  const hero = threshold(result, sport, massKg, units)
  return (
    <section
      className="sport-hero__panel sport-hero__threshold"
      aria-labelledby={`${sport}-threshold`}
    >
      <h2 id={`${sport}-threshold`} className="sport-hero__title">
        {THRESHOLD_HEADING[sport]}
      </h2>
      {hero ? (
        <p className="sport-hero__figure">
          <span className="display sport-hero__number">{hero.number}</span>
          {'\u00a0'}
          <span className="sport-hero__unit">{hero.unit}</span>
          {hero.sub && (
            <>
              {' '}
              <span className="sport-hero__side">{hero.sub}</span>
            </>
          )}
        </p>
      ) : (
        <p className="secondary">{thresholdNeedsLine(result, sport)}</p>
      )}
      {hero && (
        <ThresholdBasis
          sport={sport}
          rows={thresholdProperties(result, sport, massKg, units)}
          className="sport-hero__basis"
        />
      )}
    </section>
  )
}

import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { periodName } from '../components/rangeOptions'
import { threshold } from '../records'
import { THRESHOLD_HEADING } from '../sports'
import { thresholdBasisLine, thresholdDetail } from '../thresholdBasis'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { ThresholdBasis } from './ThresholdBasis'

/**
 * The threshold, as the page's answer: its name, the figure at display size, and under it the line that says what it rests
 * on, with how it was worked out one tap down. It is one number for a run as for a ride, with no chip and no range beside it,
 * since the name says it is a threshold; its range, the method and what heart rate did are in the detail. With no effort of
 * 3 min or more, the place says what to add.
 */
export function ThresholdPanel({
  sport,
  result,
  massKg,
  units,
  rangeDays,
}: {
  sport: Sport
  result: AnalysisResult
  massKg: number
  units: UnitSystem
  /** The period's length in days, or null for all time: the figure names it, so it is not read against another period's. */
  rangeDays: number | null
}) {
  const hero = threshold(result, sport, massKg, units)
  return (
    <section
      className="sport-hero__panel sport-hero__threshold"
      aria-labelledby={`${sport}-threshold`}
    >
      <div className="sport-hero__head">
        <h2 id={`${sport}-threshold`} className="eyebrow sport-hero__eyebrow">
          {THRESHOLD_HEADING[sport]}
        </h2>
        {/* The threshold is the period's: Profile's is all time's, and the two should not look like one figure. */}
        <span className="tag sport-hero__period">{`· ${periodName(rangeDays)}`}</span>
      </div>
      {hero ? (
        <p className="sport-hero__figure">
          <span className="display sport-hero__number">{hero.number}</span>
          <span className="sport-hero__unit">{hero.unit}</span>
          {hero.sub && <span className="sport-hero__side">{hero.sub}</span>}
        </p>
      ) : (
        <p className="secondary">{thresholdNeedsLine(result, sport)}</p>
      )}
      {hero && (
        <ThresholdBasis
          sport={sport}
          basis={thresholdBasisLine(result, sport)}
          detail={thresholdDetail(result, sport, massKg, units)}
          className="muted"
        />
      )}
    </section>
  )
}

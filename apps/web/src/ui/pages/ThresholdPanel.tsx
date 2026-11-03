import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { periodName } from '../components/rangeOptions'
import { threshold } from '../records'
import { THRESHOLD_HEADING } from '../sports'
import { thresholdBasisLine, thresholdDetail } from '../thresholdBasis'
import { bestLabel, floorBasisLine, floorThreshold } from '../thresholdFloor'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { thresholdSpan } from '../thresholdRange'
import { RangeTrack } from './RangeTrack'
import { BasisChip } from './StatTile'
import { ThresholdBasis } from './ThresholdBasis'

/**
 * Whether a fitted threshold wears the "Estimated" chip. A ride's is one best estimate and its name says it is a threshold,
 * so it wears none; a run's critical-power fit keeps the chip for now.
 */
const ESTIMATED_CHIP: Record<Sport, boolean> = { run: true, ride: false }

/**
 * The threshold, as the page's answer: its name, the figure at display size, and under it the line that says what it rests
 * on, with how it was worked out one tap down. A ride's is one number with no chip and no range beside it, since the name
 * says it is a threshold; its range and what heart rate did are in the detail. A run's fit keeps its chip that says it is an
 * estimate and its range as a track with the two ends printed under it, and its detail holds how hard the best 20 min was.
 * With a run's fit refused, the sport's floor is shown in its place as "at least" with the best it rests on, and the
 * refusal is not said; with no best of 20 min, the longest as "Best 12 min"; with no best of 5 min, the line says what to add.
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
  const fitted = threshold(result, sport, massKg, units)
  const hero = fitted ?? floorThreshold(result, sport, massKg, units)
  const span = thresholdSpan(result, sport, massKg, units)
  const effort = result.effort.find((check) => check.durationS === HEADLINE_DURATION_S)
  // A held best is a floor, not an estimate, and is not called one.
  const floor = fitted === null && hero !== null
  // A best too short to be a floor is named by what it is, and is not called "at least".
  const best = floor ? bestLabel(result, sport) : null
  // What the chip says, which the heading says to a screen reader: a floor, a best, or an estimate; a ride's estimate wears none.
  const kind = floor
    ? (best?.toLowerCase() ?? 'at least')
    : ESTIMATED_CHIP[sport]
      ? 'estimated'
      : null
  const basis = floor ? floorBasisLine(result, sport) : thresholdBasisLine(result, sport)
  const detail = fitted === null ? null : thresholdDetail(result, sport, massKg, units, effort)
  const at =
    span === null
      ? 0.5
      : (span.centreCp - span.ends[0].cp) / (span.ends[1].cp - span.ends[0].cp || 1)
  return (
    <section
      className="sport-hero__panel sport-hero__threshold"
      aria-labelledby={`${sport}-threshold`}
    >
      <div className="sport-hero__head">
        {/* The accessible name carries the chip's kind; the chip beside it repeats it for the eye. A name set in an
            off-screen span would be read with a gap in it, "Threshold pace , estimated". */}
        <h2
          id={`${sport}-threshold`}
          className="eyebrow sport-hero__eyebrow"
          aria-label={
            kind === null ? THRESHOLD_HEADING[sport] : `${THRESHOLD_HEADING[sport]}, ${kind}`
          }
        >
          {THRESHOLD_HEADING[sport]}
        </h2>
        {/* The threshold is the period's: Profile's is all time's, and the two should not look like one figure. */}
        <span className="tag sport-hero__period">{`· ${periodName(rangeDays)}`}</span>
        {hero && kind !== null && (
          <span aria-hidden="true">
            <BasisChip
              basis={best !== null ? 'recorded' : floor ? 'floor' : 'estimated'}
              label={best ?? undefined}
            />
          </span>
        )}
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
      {hero && span && (
        <div className="sport-hero__track">
          <RangeTrack
            ends={[span.ends[0].text, span.ends[1].text]}
            at={Math.min(Math.max(at, 0), 1)}
            label={`range, ${hero.unit}`}
            spread={span.spread}
          />
        </div>
      )}
      {hero && <ThresholdBasis sport={sport} basis={basis} detail={detail} className="muted" />}
    </section>
  )
}

import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { periodName } from '../components/rangeOptions'
import { effortChipText } from '../effortCaveat'
import { threshold } from '../records'
import { THRESHOLD_HEADING, THRESHOLD_MEANING } from '../sports'
import { floorThreshold } from '../thresholdFloor'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { thresholdSpan } from '../thresholdRange'
import {
  heldBestHeading,
  thresholdUncheckedLine,
  thresholdWithheldLine,
} from '../thresholdWithheld'
import { unevenNote } from '../unevenNote'
import { EffortChip } from './EffortChip'
import { RangeTrack } from './RangeTrack'
import { BasisChip } from './StatTile'

/** What the track's range is called under it: the fit's own spread, or the range between two fits. */
const SPAN_LABEL = { spread: 'fit spread', between: 'range' } as const

/**
 * The threshold, as the page's answer: its name with a chip that says whether it is an estimate, the figure at
 * display size, its range drawn as a track with the two ends printed under it, what it means, and whether the
 * best 20 minutes was a hard effort. With the fit refused, a held best is shown in its place as "at least",
 * and the refusal is not said; with neither, the line says what is needed.
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
  const floorNote = unevenNote(result, sport)
  const withheld = thresholdWithheldLine(result, sport)
  const heldHeading = heldBestHeading(result, sport)
  const unchecked = fitted === null ? null : thresholdUncheckedLine(result, sport)
  // The line under a withheld best says what the chip would, so the chip is left out beside it.
  const effortChip =
    withheld === null
      ? effortChipText(
          sport,
          result.effort.find((check) => check.durationS === HEADLINE_DURATION_S),
        )
      : null
  // A held best is a floor, not an estimate, and is not called one.
  const floor = fitted === null && hero !== null
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
        {/* The accessible name carries the figure's whole kind; the chip beside it repeats it for the eye. A name set in
            an off-screen span would be read with a gap in it, "Threshold pace , estimated". */}
        <h2
          id={`${sport}-threshold`}
          className="eyebrow sport-hero__eyebrow"
          aria-label={
            heldHeading === null
              ? `${THRESHOLD_HEADING[sport]}${floor ? ', at least' : ', estimated'}`
              : `${heldHeading}, recorded`
          }
        >
          {heldHeading ?? THRESHOLD_HEADING[sport]}
        </h2>
        {/* The threshold is the period's: Profile's is all time's, and the two should not look like one figure. */}
        <span className="sport-hero__period">{`· ${periodName(rangeDays)}`}</span>
        {hero && (
          <span aria-hidden="true">
            <BasisChip
              basis={heldHeading === null ? (floor ? 'floor' : 'estimated') : 'recorded'}
            />
          </span>
        )}
        {effortChip && <EffortChip chip={effortChip} className="sport-hero__check" />}
      </div>
      {hero ? (
        <p className="sport-hero__figure">
          <span className="sport-hero__number">{hero.number}</span>
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
            label={`${span.spread ? SPAN_LABEL.spread : SPAN_LABEL.between}, ${hero.unit}`}
            spread={span.spread}
          />
        </div>
      )}
      {hero && floorNote && <p className="muted">{floorNote}</p>}
      {hero && withheld && <p className="muted">{withheld}</p>}
      {unchecked && <p className="muted">{unchecked}</p>}
      {fitted && <p className="sport-hero__meaning">{THRESHOLD_MEANING[sport]}</p>}
    </section>
  )
}

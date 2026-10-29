import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { CheckIcon } from '../components/icons'
import { effortShare } from '../effortCaveat'
import { threshold } from '../records'
import { THRESHOLD_HEADING, THRESHOLD_MEANING } from '../sports'
import { floorThreshold } from '../thresholdFloor'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { thresholdSpan } from '../thresholdRange'
import { unevenNote } from '../unevenNote'
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
}: {
  sport: Sport
  result: AnalysisResult
  massKg: number
  units: UnitSystem
}) {
  const fitted = threshold(result, sport, massKg, units)
  const hero = fitted ?? floorThreshold(result, sport, massKg, units)
  const span = thresholdSpan(result, sport, massKg, units)
  const floorNote = unevenNote(result, sport)
  const share = effortShare(
    sport,
    result.effort.find((check) => check.durationS === HEADLINE_DURATION_S),
  )
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
        {/* The name is the figure's whole kind to a screen reader: the chip beside it repeats it for the eye. */}
        <h2 id={`${sport}-threshold`} className="eyebrow sport-hero__eyebrow">
          {THRESHOLD_HEADING[sport]}
          <span className="sr-only">{floor ? ', at least' : ', estimated'}</span>
        </h2>
        {hero && (
          <span aria-hidden="true">
            <BasisChip basis={floor ? 'floor' : 'estimated'} />
          </span>
        )}
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
      {fitted && <p className="sport-hero__meaning">{THRESHOLD_MEANING[sport]}</p>}
      {share && (
        <p
          className={`sport-hero__check ${share.hard ? 'sport-hero__check--hard' : 'sport-hero__check--soft'}`}
        >
          {share.hard && <CheckIcon />}
          <span>{share.line}</span>
        </p>
      )}
    </section>
  )
}

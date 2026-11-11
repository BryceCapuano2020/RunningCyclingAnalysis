import type { AnalysisResult } from '@rca/core/pipeline'
import type { RacePrediction } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import { formatRecordTime } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from '../components/property'
import { HeldSportFacts } from '../components/HeldSportFacts'
import { WeightNote } from '../components/WeightNote'
import type { GradeOutcome } from '../grades'
import { threshold } from '../records'
import { THRESHOLD_MEANING } from '../sports'
import { HEADLINE_NAME, THRESHOLD_NAME } from '../thresholdName'
import { thresholdProperties } from '../thresholdBasis'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { gradeLine, needsWeight } from './thresholdTileBare'
import { StatTile } from './StatTile'
import { ThresholdBasis } from './ThresholdBasis'

export interface ThresholdTileProps {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /** The sport's grade at its threshold; null while the year of birth or sex is missing. */
  grade: GradeOutcome | null
  /** False while no body weight is entered; a ride's figures then wait for it. */
  weighted: boolean
  /** True where the page's headline already says what the threshold needs (a library of one sport), so the tile does not repeat it. */
  needInHeadline?: boolean
  /** True where the levels row under the meter already gives each sport's level and grade: the tile then keeps only the effort. */
  levelShown?: boolean
  /** False on a second threshold tile in the same view, where the word is already defined: the screen defines it once. */
  defineTerm?: boolean
  /** A run's predicted half marathon, which the row leads with in place of the threshold pace; null or absent without one. */
  half?: RacePrediction | null
}

/** Each sport's row name: a ride's functional threshold power, a run's threshold (until its half marathon leads). */
const ROW_NAME: Record<Sport, string> = { run: THRESHOLD_NAME.run, ride: HEADLINE_NAME.ride }

/** The word in each tile's name that is defined in place, and what it means: the threshold in plain words. */
const DEFINED: Record<Sport, { term: string; meaning: string }> = {
  run: { term: 'threshold', meaning: THRESHOLD_MEANING.run },
  ride: { term: 'threshold', meaning: THRESHOLD_MEANING.ride },
}

/**
 * A sport's threshold as a tile: the figure at display size, the line that says what it rests on, and how it was worked out
 * one tap down; the tile gives the level the threshold grades at. It is one number for a run as for a ride, with no chip
 * and no range shape: a threshold is an estimate by its name, and its range is in the detail. A sport with no effort its
 * estimate reads (3 min for a ride, 8 for a run) says what it needs. A ride's figures wait for the weight, which the tile says in its place.
 */
export function ThresholdTile({
  sport,
  result,
  units,
  massKg,
  grade,
  weighted,
  needInHeadline = false,
  levelShown = false,
  defineTerm = true,
  half = null,
}: ThresholdTileProps) {
  // A fitted threshold's title says what it is, so the word is defined only where there is no figure to read.
  const defined = defineTerm ? DEFINED[sport] : undefined
  // A ride's row is its functional threshold power in every state; a run's is its threshold until a half marathon leads.
  const name = ROW_NAME[sport]
  if (needsWeight(sport, weighted)) {
    return (
      <StatTile sport={sport} heading={name} definition={defined}>
        {/* What needs no weight: how many rides, how long, when the latest was, and a best a meter measured. Then the one ask. */}
        <HeldSportFacts
          sport={sport}
          activities={result.activities}
          measured={result.rideMeasuredCurve}
        />
        <WeightNote />
      </StatTile>
    )
  }
  const hero = threshold(result, sport, massKg, units)
  const line = gradeLine(sport, grade, levelShown, hero !== null)
  if (hero === null) {
    if (needInHeadline && line === null) return null
    return (
      <StatTile sport={sport} heading={name} definition={defined}>
        {needInHeadline ? null : (
          <p className="stat-tile__line">{thresholdNeedsLine(result, sport)}</p>
        )}
        {line === null ? null : <p className="stat-tile__line">{line}</p>}
      </StatTile>
    )
  }
  const basis = thresholdProperties(result, sport, massKg, units)
  // A run leads with its half marathon: its likely span and the threshold pace come first in Details, then what the pace
  // rests on. A ride shows its watts alone; the watts per kilogram are the first line of Details.
  const lead =
    half !== null
      ? {
          heading: HEADLINE_NAME.half,
          figure: { number: formatRecordTime(half.seconds), unit: '' },
          rows: [
            {
              label: 'Likely time',
              value: `${formatRecordTime(half.low)} to ${formatRecordTime(half.high)}`,
            },
            { label: 'Threshold pace', value: `${hero.number} ${hero.unit}` },
            ...basis.filter((row) => row.label !== 'Range'),
          ] satisfies Property[],
        }
      : {
          heading: name,
          figure: { number: hero.number, unit: hero.unit },
          // A ride's second reading, its watts per kilogram, is the first line of Details rather than beside the figure.
          rows: [
            ...(hero.sub === null ? [] : [{ label: 'Per kilogram', value: hero.sub }]),
            ...basis,
          ],
        }
  return (
    <StatTile sport={sport} heading={lead.heading} figure={lead.figure}>
      <ThresholdBasis
        sport={sport}
        rows={lead.rows}
        className="stat-tile__source"
        name={half === null ? undefined : lead.heading}
      />
      {line === null ? null : <p className="stat-tile__line">{line}</p>}
    </StatTile>
  )
}

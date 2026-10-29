import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { WeightNote } from '../components/WeightNote'
import { HEADLINE_LABEL, gradeParts } from '../grades'
import type { GradeOutcome } from '../grades'
import { CHIP_DURATIONS_S, headlineEffort, sportRecords, threshold } from '../records'
import { SPORT_LABEL, THRESHOLD_MEANING } from '../sports'
import { floorThreshold } from '../thresholdFloor'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { thresholdSpan } from '../thresholdRange'
import { RangeTrack } from './RangeTrack'
import { StatTile } from './StatTile'

export interface ThresholdTileProps {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /** The sport's grade at the headline duration; null while the year of birth or sex is missing. */
  grade: GradeOutcome | null
  /** False while no body weight is entered; a ride's figures then wait for it. */
  weighted: boolean
}

/** The tile's name: the sport and what the figure is, in the words the card used to carry as its label. */
const NAME: Record<Sport, string> = {
  run: `${SPORT_LABEL.run} threshold`,
  ride: `${SPORT_LABEL.ride} threshold`,
}

/** The word in each tile's name that is defined in place, and what it means: the threshold in plain words. */
const DEFINED: Record<Sport, { term: string; meaning: string }> = {
  run: { term: 'threshold', meaning: THRESHOLD_MEANING.run },
  ride: { term: 'threshold', meaning: THRESHOLD_MEANING.ride },
}

/** The grade line under the figure: the level and grade, and the best effort it rests on. */
function gradeLine(sport: Sport, grade: GradeOutcome | null, effort: string | null): string | null {
  if (grade === null) return null
  if (grade.kind === 'gap') return grade.reason
  const { level, value, range } = gradeParts(sport, grade.grade, 'row')
  const grades = `${level} · ${value}${range === null ? '' : ` (${range})`}`
  return `${grades} on your best ${HEADLINE_LABEL}${effort === null ? '' : `, ${effort}`}.`
}

/**
 * A sport's threshold as a tile: the estimated figure at display size, its error range as a shape, and the
 * level its best 20 minutes grades at. A threshold the fit refused shows the floor of the efforts it left out
 * under the chip "At least"; one that cannot be drawn yet says what it needs. A ride's figures wait for the
 * weight, which the tile says in its place.
 */
export function ThresholdTile({
  sport,
  result,
  units,
  massKg,
  grade,
  weighted,
}: ThresholdTileProps) {
  if (sport === 'ride' && !weighted) {
    return (
      <StatTile sport={sport} heading={NAME[sport]} definition={DEFINED[sport]}>
        <WeightNote />
      </StatTile>
    )
  }
  const fitted = threshold(result, sport, massKg, units)
  const hero = fitted ?? floorThreshold(result, sport, massKg, units)
  const records = sportRecords(result, sport, massKg, units).filter((record) =>
    CHIP_DURATIONS_S.includes(record.durationS),
  )
  const line = gradeLine(sport, grade, headlineEffort(sport, records))
  if (hero === null) {
    return (
      <StatTile sport={sport} heading={NAME[sport]} definition={DEFINED[sport]}>
        <p className="stat-tile__line">{thresholdNeedsLine(result, sport)}</p>
        {line === null ? null : <p className="stat-tile__line">{line}</p>}
      </StatTile>
    )
  }
  const found = fitted === null ? null : thresholdSpan(result, sport, massKg, units)
  // A range whose ends are one number, as when the fit has no spread, has nothing to draw and nowhere to put the ring.
  const span =
    found === null ||
    found.ends[0].text === found.ends[1].text ||
    found.ends[0].cp === found.ends[1].cp
      ? null
      : found
  // Where the threshold sits between the two ends: the middle of a fit's spread, an end for the run to an uneven fit.
  const at =
    span === null ? 0.5 : (span.centreCp - span.ends[0].cp) / (span.ends[1].cp - span.ends[0].cp)
  return (
    <StatTile
      sport={sport}
      heading={NAME[sport]}
      definition={DEFINED[sport]}
      basis={fitted === null ? 'floor' : 'estimated'}
      figure={{
        number: hero.number,
        unit: hero.unit,
        ...(hero.sub === null ? {} : { side: hero.sub }),
      }}
      track={
        span === null ? null : (
          <RangeTrack
            ends={[span.ends[0].text, span.ends[1].text]}
            at={at}
            label={span.spread ? 'fit spread' : 'range'}
            spread={span.spread}
          />
        )
      }
    >
      {line === null ? null : <p className="stat-tile__line">{line}</p>}
    </StatTile>
  )
}

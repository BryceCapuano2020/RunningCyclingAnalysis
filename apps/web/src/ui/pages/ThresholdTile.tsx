import type { AnalysisResult } from '@rca/core/pipeline'
import type { EffortCheck, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { HeldSportFacts } from '../components/HeldSportFacts'
import { WeightNote } from '../components/WeightNote'
import type { GradeOutcome } from '../grades'
import { CHIP_DURATIONS_S, headlineEffort, sportRecords, threshold } from '../records'
import { SPORT_LABEL, THRESHOLD_GLOSS, THRESHOLD_MEANING } from '../sports'
import { bestLabel, floorBasisLine, floorThreshold } from '../thresholdFloor'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { bestBeyondThresholdLine } from '../thresholdBest'
import { thresholdSpan } from '../thresholdRange'
import { thresholdUncheckedLine } from '../thresholdUnchecked'
import { gradeLine, needsWeight } from './thresholdTileBare'
import { EffortChip } from './EffortChip'
import { effortChipText } from '../effortCaveat'
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
  /** The heart-rate check of the headline effort, which the tile's grade rests on; null or absent says nothing of effort. */
  effort?: EffortCheck | null
  /** True where the page's headline already says what the threshold needs (a library of one sport), so the tile does not repeat it. */
  needInHeadline?: boolean
  /** True where the levels row under the meter already gives each sport's level and grade: the tile then keeps only the effort. */
  levelShown?: boolean
  /** False on a second threshold tile in the same view, where the word is already defined: the screen defines it once. */
  defineTerm?: boolean
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

/**
 * A sport's threshold as a tile: the estimated figure at display size, its error range as a shape, and the
 * level its best 20 minutes grades at. A threshold the fit refused shows the sport's floor under the chip "At least",
 * with the one best it rests on, or, with no best of 20 min, its longest as "Best 12 min"; only a sport that holds no
 * best of 5 min says what it needs. A ride's figures wait for the
 * weight, which the tile says in its place.
 */
export function ThresholdTile({
  sport,
  result,
  units,
  massKg,
  grade,
  weighted,
  effort: effortCheck = null,
  needInHeadline = false,
  levelShown = false,
  defineTerm = true,
}: ThresholdTileProps) {
  // A fitted threshold has its gloss under the name, which says what it is, so the word is defined only where it has none.
  const defined = defineTerm ? DEFINED[sport] : undefined
  if (needsWeight(sport, weighted)) {
    return (
      <StatTile sport={sport} heading={NAME[sport]} definition={defined}>
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
  const fitted = threshold(result, sport, massKg, units)
  const hero = fitted ?? floorThreshold(result, sport, massKg, units)
  const definition = fitted === null ? defined : undefined
  const records = sportRecords(result, sport, massKg, units).filter((record) =>
    CHIP_DURATIONS_S.includes(record.durationS),
  )
  const effort = headlineEffort(sport, records)
  const basis = fitted === null ? floorBasisLine(result, sport) : null
  const best = fitted === null ? bestLabel(result, sport) : null
  const unchecked = fitted === null ? null : thresholdUncheckedLine(result, sport)
  const chip = effortChipText(sport, effortCheck)
  // Where the best 20 minutes has its own line, the grade line leaves its figure out rather than say it twice.
  const bestLine = fitted === null ? null : bestBeyondThresholdLine(result, sport, effort)
  const line = gradeLine(sport, grade, bestLine === null ? effort : null, levelShown)
  if (hero === null) {
    if (needInHeadline && line === null) return null
    return (
      <StatTile sport={sport} heading={NAME[sport]} definition={definition}>
        {needInHeadline ? null : (
          <p className="stat-tile__line">{thresholdNeedsLine(result, sport)}</p>
        )}
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
      definition={definition}
      gloss={fitted === null ? undefined : THRESHOLD_GLOSS[sport]}
      basis={fitted === null ? (best === null ? 'floor' : 'recorded') : 'estimated'}
      basisLabel={best ?? undefined}
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
            label="range"
            spread={span.spread}
          />
        )
      }
    >
      {bestLine === null ? null : <p className="stat-tile__line">{bestLine}</p>}
      {basis === null ? null : <p className="stat-tile__line">{basis}</p>}
      {unchecked === null ? null : <p className="stat-tile__line">{unchecked}</p>}
      {line === null ? null : <p className="stat-tile__line">{line}</p>}
      {chip === null ? null : (
        <p className="stat-tile__effort">
          <EffortChip chip={chip} />
        </p>
      )}
    </StatTile>
  )
}

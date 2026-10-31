import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { countSport } from '../records'
import type { GradeOutcome } from '../grades'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import { SPORT_ORDER } from '../sports'
import { CrossSportCard } from './CrossSportCard'
import { EmptySportCard } from './EmptySportCard'
import { ThresholdTile } from './ThresholdTile'
import './BalanceTiles.css'

export interface BalanceTilesProps {
  result: AnalysisResult
  /** Every activity in the library, so an empty sport can say what All time holds. */
  library: ActivitySummary[]
  units: UnitSystem
  massKg: number
  grades: Record<Sport, GradeOutcome | null>
  /** False while no body weight is entered: a ride's figures wait for it. */
  weighted: boolean
  period: Period
  onAddFiles: (files: File[]) => void
  /** The one sport the library holds: the sport it lacks is invited at the page's foot, not given a card here. */
  soleSport?: Sport | null
  /** A sport whose runs are all at walking pace and left out: its prompt says so and offers to count them. */
  leftOut?: LeftOutRuns
}

/**
 * The headline numbers, at most three: each sport's threshold, and what the ride is worth on foot. The lean
 * between the sports is the headline and the meter's to say, once, so it has no tile. A sport with nothing in
 * the period is a prompt in its place; the ride on foot needs both sports, so it is left out with one.
 */
export function BalanceTiles({
  result,
  library,
  units,
  massKg,
  grades,
  weighted,
  period,
  onAddFiles,
  soleSport = null,
  leftOut,
}: BalanceTilesProps) {
  const both = SPORT_ORDER.every((sport) => countSport(result.activities, sport) > 0)
  // The heart-rate check of the headline effort, which each threshold tile says for its own sport.
  const effortCheck = result.effort.find((check) => check.durationS === HEADLINE_DURATION_S) ?? null
  const tiles = [
    ...SPORT_ORDER.map((sport) =>
      countSport(result.activities, sport) > 0 ? (
        <ThresholdTile
          key={sport}
          sport={sport}
          result={result}
          units={units}
          massKg={massKg}
          grade={grades[sport]}
          weighted={weighted}
          effort={effortCheck}
          needInHeadline={soleSport !== null}
        />
      ) : soleSport !== null ? null : (
        <EmptySportCard
          key={sport}
          sport={sport}
          inLibrary={countSport(library, sport)}
          period={period}
          onAddFiles={onAddFiles}
          leftOut={leftOut?.sport === sport ? leftOut : undefined}
        />
      ),
    ),
    ...(both
      ? [
          <CrossSportCard
            key="foot"
            result={result}
            units={units}
            weighted={weighted}
            period={period}
          />,
        ]
      : []),
  ].filter((tile) => tile !== null)
  return (
    <section
      className="balance-tiles"
      aria-labelledby="balance-tiles-title"
      data-tiles={tiles.length}
    >
      <h2 id="balance-tiles-title" className="sr-only">
        Headline numbers
      </h2>
      {tiles}
    </section>
  )
}

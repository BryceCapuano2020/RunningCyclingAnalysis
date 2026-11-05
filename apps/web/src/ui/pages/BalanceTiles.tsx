import type { ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { countSport } from '../records'
import type { GradeOutcome } from '../grades'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import { BALANCE_PAIR } from '../sports'
import { RowIndex } from '../components/RowList'
import { CrossSportCard } from './CrossSportCard'
import { EmptySportCard } from './EmptySportCard'
import { ThresholdTile } from './ThresholdTile'
import { thresholdTileIsBare } from './thresholdTileBare'
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
  /** True where the levels row already gives each sport's level and grade, so a tile does not say them again. */
  levelShown?: boolean
}

/**
 * The headline numbers, at most three, as numbered rows: each sport's threshold, and what the ride is worth as a run. The lean
 * between the sports is the headline and the meter's to say, once, so it has no tile. A sport with nothing in
 * the period is a prompt in its place; the ride as a run needs both sports, so it is left out with one.
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
  levelShown = false,
}: BalanceTilesProps) {
  const both = BALANCE_PAIR.every((sport) => countSport(result.activities, sport) > 0)
  // A word defined in place is defined once on the screen: the first threshold tile carries it.
  const firstThreshold = BALANCE_PAIR.find((sport) => countSport(result.activities, sport) > 0)
  const thresholdProps = (sport: Sport) => ({
    sport,
    result,
    units,
    massKg,
    grade: grades[sport],
    weighted,
    needInHeadline: soleSport !== null,
    levelShown,
    defineTerm: sport === firstThreshold,
  })
  // Each row: its sport, whose ink its index takes (the ride as a run is a ride's), and what it shows.
  const tiles: { key: string; sport: Sport; node: ReactNode }[] = [
    ...BALANCE_PAIR.flatMap((sport) =>
      countSport(result.activities, sport) > 0
        ? thresholdTileIsBare(thresholdProps(sport))
          ? []
          : [{ key: sport, sport, node: <ThresholdTile {...thresholdProps(sport)} /> }]
        : soleSport !== null
          ? []
          : [
              {
                key: sport,
                sport,
                node: (
                  <EmptySportCard
                    sport={sport}
                    inLibrary={countSport(library, sport)}
                    period={period}
                    onAddFiles={onAddFiles}
                    leftOut={leftOut?.sport === sport ? leftOut : undefined}
                  />
                ),
              },
            ],
    ),
    ...(both
      ? [
          {
            key: 'foot',
            sport: 'ride' as const,
            node: (
              <CrossSportCard result={result} units={units} weighted={weighted} massKg={massKg} />
            ),
          },
        ]
      : []),
  ]
  // A sport's tile that would hold only its name is left out, and with nothing else there is no section either.
  if (tiles.length === 0) return null
  return (
    <section
      className="band balance-tiles"
      aria-labelledby="balance-tiles-title"
      data-tiles={tiles.length}
    >
      <h2 id="balance-tiles-title" className="sr-only">
        Headline numbers
      </h2>
      <ol className="rows">
        {tiles.map(({ key, sport, node }, index) => (
          <li key={key} className="row row--figures" data-sport={sport}>
            <RowIndex index={index} />
            {node}
          </li>
        ))}
      </ol>
    </section>
  )
}

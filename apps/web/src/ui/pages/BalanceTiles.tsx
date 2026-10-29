import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { BalanceReading } from '../components/balanceScale'
import { countSport } from '../records'
import type { GradeOutcome } from '../grades'
import { SPORT_ORDER } from '../sports'
import { CrossSportCard } from './CrossSportCard'
import { EmptySportCard } from './EmptySportCard'
import { LeanTile } from './LeanTile'
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
  /** The balance as points, when both sports are graded; the lean tile waits for it. */
  reading: BalanceReading | null
  onAddFiles: (files: File[]) => void
}

/**
 * The four headline numbers: each sport's threshold, the lean between them, and what the ride is worth on
 * foot. A sport with nothing in the period is a prompt in its place; the lean and the ride on foot need both
 * sports, so they are left out with one.
 */
export function BalanceTiles({
  result,
  library,
  units,
  massKg,
  grades,
  weighted,
  period,
  reading,
  onAddFiles,
}: BalanceTilesProps) {
  const both = SPORT_ORDER.every((sport) => countSport(result.activities, sport) > 0)
  const estimated = SPORT_ORDER.some((sport) => {
    const outcome = grades[sport]
    return outcome?.kind === 'graded' && outcome.grade.range !== null
  })
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
        />
      ) : (
        <EmptySportCard
          key={sport}
          sport={sport}
          inLibrary={countSport(library, sport)}
          period={period}
          onAddFiles={onAddFiles}
        />
      ),
    ),
    ...(reading === null || !weighted
      ? []
      : [<LeanTile key="lean" reading={reading} estimated={estimated} />]),
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
  ]
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

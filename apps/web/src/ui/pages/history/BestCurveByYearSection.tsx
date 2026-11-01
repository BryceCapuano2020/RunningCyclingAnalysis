import { useState } from 'react'
import type { YearCurves } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { YearCurvesChart } from '../../charts/YearCurvesChart'
import { SPORT_ORDER } from '../../sports'
import { SportToggle } from './SportToggle'

export interface BestCurveByYearSectionProps {
  curves: YearCurves
  units: UnitSystem
}

/** Years to compare: a curve of one year alone is the sport page's own, so it needs two. */
const MIN_YEARS = 2

/** The best curve of each year, for the run or the ride: the sports with two years of curves are the toggle's choices. */
export function BestCurveByYearSection({ curves, units }: BestCurveByYearSectionProps) {
  const sports = SPORT_ORDER.filter((sport) => curves[sport].years.length >= MIN_YEARS)
  const [picked, setPicked] = useState<Sport | null>(null)
  const sport = sports.find((candidate) => candidate === picked) ?? sports[0]
  if (sport === undefined) {
    return <p className="secondary">Add runs or rides from more than one year to compare years.</p>
  }
  return (
    <>
      <SportToggle sports={sports} selected={sport} onSelect={setPicked} />
      <YearCurvesChart key={sport} sport={sport} curves={curves[sport]} units={units} />
    </>
  )
}

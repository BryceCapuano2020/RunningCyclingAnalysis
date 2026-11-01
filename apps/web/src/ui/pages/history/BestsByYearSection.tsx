import { useState } from 'react'
import type { YearBests } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { BestsByYearChart } from '../../charts/BestsByYearChart'
import { SPORT_ORDER } from '../../sports'
import { SportToggle } from './SportToggle'

export interface BestsByYearSectionProps {
  bests: YearBests
  units: UnitSystem
}

/** Bests by year, for the run or the ride: the sports with a best are the toggle's choices. */
export function BestsByYearSection({ bests, units }: BestsByYearSectionProps) {
  const sports = SPORT_ORDER.filter((sport) => bests[sport].length > 0)
  const [picked, setPicked] = useState<Sport | null>(null)
  const sport = sports.find((candidate) => candidate === picked) ?? sports[0]
  if (sport === undefined) {
    return <p className="secondary">Add outdoor runs or rides to see your bests by year.</p>
  }
  return (
    <>
      <SportToggle sports={sports} selected={sport} onSelect={setPicked} />
      <BestsByYearChart key={sport} sport={sport} efforts={bests[sport]} units={units} />
    </>
  )
}

import { useState } from 'react'
import type { IntensityRow } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { IntensityByYearChart } from '../../charts/IntensityByYearChart'
import { SPORT_ORDER } from '../../sports'
import { sportToggle } from './sportToggle'

export interface IntensityByYearSectionProps {
  years: readonly IntensityRow[]
}

/**
 * The intensity chart with a sport toggle when both sports have heart-rate time. It opens on the first sport in
 * SPORT_ORDER that has heart-rate time, else the first with any activity, so a rides-only library opens on riding.
 */
export function IntensityByYearSection({ years }: IntensityByYearSectionProps) {
  const withTime = SPORT_ORDER.filter((sport) => years.some((row) => row.sports[sport].seconds > 0))
  const withActivities = SPORT_ORDER.filter((sport) =>
    years.some((row) => row.sports[sport].activities > 0),
  )
  const [picked, setPicked] = useState<Sport | null>(null)
  const [first] = [...withTime, ...withActivities, ...SPORT_ORDER]
  const sport: Sport = picked ?? first!
  return (
    <IntensityByYearChart
      years={years}
      sport={sport}
      controls={sportToggle({ sports: withTime, selected: sport, onSelect: setPicked })}
    />
  )
}

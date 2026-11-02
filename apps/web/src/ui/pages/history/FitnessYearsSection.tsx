import { useState } from 'react'
import type { History } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FitnessYearsChart } from '../../charts/FitnessYearsChart'
import { SPORT_ORDER } from '../../sports'
import { sportToggle } from './sportToggle'

export interface FitnessYearsSectionProps {
  fitness: History['fitness']
  units: UnitSystem
}

/**
 * The fewest steady activities a sport needs for the chart to be offered for it: the median reads 4 dots within 12
 * weeks, and one or two dots are not years.
 */
const MIN_DOTS = 8

/**
 * The fitness dots of one sport at a time: the sports with enough steady activities are the toggle's choices. A library
 * with neither gets one line saying what to add.
 */
export function FitnessYearsSection({ fitness, units }: FitnessYearsSectionProps) {
  const sports = SPORT_ORDER.filter((sport) => fitness[sport].levels.length >= MIN_DOTS)
  const [picked, setPicked] = useState<Sport | null>(null)
  const sport = sports.find((candidate) => candidate === picked) ?? sports[0]
  if (sport === undefined) {
    return (
      <p className="secondary">
        Add steady runs with heart rate, or rides with power, to see your fitness over the years.
      </p>
    )
  }
  return (
    <FitnessYearsChart
      sport={sport}
      dots={fitness[sport]}
      units={units}
      controls={sportToggle({ sports, selected: sport, onSelect: setPicked })}
    />
  )
}

import { useState } from 'react'
import type { History } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FitnessYearsChart, FitnessYearsEmpty } from '../../charts/FitnessYearsChart'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SPORT_LABEL, SPORT_ORDER } from '../../sports'

export interface FitnessYearsPanelProps {
  fitness: History['fitness']
  units: UnitSystem
}

/**
 * The fewest steady activities a sport needs for the chart to be offered for it: the median reads 4 dots within 12
 * weeks, and one or two dots are not years.
 */
const MIN_DOTS = 8

/**
 * The fitness dots of one sport at a time, with a toggle when both sports have enough. A library with
 * neither gets a line about what to add in the chart's place.
 */
export function FitnessYearsPanel({ fitness, units }: FitnessYearsPanelProps) {
  const [picked, setPicked] = useState<Sport | null>(null)
  const sports = SPORT_ORDER.filter((sport) => fitness[sport].levels.length >= MIN_DOTS)
  const sport = sports.find((s) => s === picked) ?? sports[0]
  if (sport === undefined) return <FitnessYearsEmpty />
  return (
    <div className="fitness-years">
      {sports.length < 2 ? null : (
        <SegmentedControl
          legend="Sport"
          legendHidden
          options={sports.map((s) => ({ value: s, label: SPORT_LABEL[s] }))}
          selected={sport}
          onSelect={setPicked}
        />
      )}
      <FitnessYearsChart key={sport} sport={sport} dots={fitness[sport]} units={units} />
    </div>
  )
}

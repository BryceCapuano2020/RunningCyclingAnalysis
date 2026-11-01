import type { Sport } from '@rca/core/types'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SPORT_LABEL } from '../../sports'

export interface SportToggleProps {
  /** The sports the chart has something for, in the order they sit. */
  sports: readonly Sport[]
  selected: Sport
  onSelect: (sport: Sport) => void
}

/** The Run and Ride choice above a History chart; a chart with one sport has no choice to make. */
export function SportToggle({ sports, selected, onSelect }: SportToggleProps) {
  if (sports.length < 2) return null
  return (
    <SegmentedControl
      legend="Sport"
      legendHidden
      options={sports.map((sport) => ({ value: sport, label: SPORT_LABEL[sport] }))}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

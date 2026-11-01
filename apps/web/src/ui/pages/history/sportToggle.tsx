import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SPORT_LABEL } from '../../sports'

export interface SportToggleProps {
  /** The sports the chart has something for, in the order they sit. */
  sports: readonly Sport[]
  selected: Sport
  onSelect: (sport: Sport) => void
}

/**
 * The Run and Ride choice for a History chart's `controls` row, or nothing when the chart has one sport and so no
 * choice to make. It sits in the frame, so the chart keeps it when it redraws for the other sport.
 */
export function sportToggle({ sports, selected, onSelect }: SportToggleProps): ReactNode {
  if (sports.length < 2) return undefined
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

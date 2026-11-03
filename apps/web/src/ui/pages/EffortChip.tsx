import { Definition } from '../components/Definition'
import { CheckIcon, WarningIcon } from '../components/icons'
import type { EffortChipText } from '../effortCaveat'

export interface EffortChipProps {
  /** The check as `effortChipText` words it; the chip is only drawn for one. */
  chip: EffortChipText
  /** A class for the page that places it. */
  className?: string
}

/**
 * How hard an effort was, by heart rate, as one chip: "Not all-out" or "Hard effort". The whole reading, the share of the
 * max heart rate and what would change it, opens from the chip as a definition. The ride on foot card draws it, for a
 * length other than the best 20 minutes.
 */
export function EffortChip({ chip, className }: EffortChipProps) {
  return (
    <span
      className={`chip ${chip.hard ? 'chip--good' : 'chip--warning'}${className === undefined ? '' : ` ${className}`}`}
    >
      {chip.hard ? <CheckIcon /> : <WarningIcon />}
      <Definition meaning={chip.detail}>{chip.label}</Definition>
    </span>
  )
}

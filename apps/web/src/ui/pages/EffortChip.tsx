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
 * How hard the best 20 minutes behind a grade were, by heart rate, as one chip with the share beside it: "Not a hard
 * effort · 70%", or "Hard effort · 95%". The whole reading, the reference it is a share of and what would change it,
 * opens from the chip as a definition. Balance's tiles and the sport pages' threshold panels share it.
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

import { GIB, MIB } from '@rca/core/constants'
import type { UnitSystem } from '@rca/core/units'
import { formatCount } from './count'

/** The unit a pace is read in after its number, spoken: "7 minutes 5 seconds per mile". */
export const PER: Record<UnitSystem, string> = { imperial: 'per mile', metric: 'per kilometre' }

/** A size in bytes, in whole megabytes, for telling people a limit: "over 64 MB". */
export function megabytes(bytes: number): number {
  return Math.round(bytes / MIB)
}

/** A size as a limit a person reads: a whole number of gigabytes as "2 GB", otherwise megabytes. */
export function sizeText(bytes: number): string {
  return bytes % GIB === 0
    ? `${formatCount(bytes / GIB)} GB`
    : `${formatCount(megabytes(bytes))} MB`
}

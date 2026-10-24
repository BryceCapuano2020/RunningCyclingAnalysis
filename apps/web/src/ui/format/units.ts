import type { UnitSystem } from '@rca/core/units'

/** The unit a pace is read in after its number, spoken: "7 minutes 5 seconds per mile". */
export const PER: Record<UnitSystem, string> = { imperial: 'per mile', metric: 'per kilometre' }

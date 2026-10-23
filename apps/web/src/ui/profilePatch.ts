import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'

/** A change to the settings a signed-in or signed-out user keeps. */
export type ProfilePatch = Partial<{
  settings: AthleteSettings
  units: UnitSystem
  keepFiles: boolean
}>

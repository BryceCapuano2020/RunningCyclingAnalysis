import type { Profile, ProfileInput, Sex } from '@rca/contract'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'

/** A change to what the app keeps about the athlete, signed in or out. */
export type ProfilePatch = Partial<{
  settings: AthleteSettings
  units: UnitSystem
  keepFiles: boolean
  birthYear: number | null
  sex: Sex | null
  /** Signed out only: the device's setup is marked done in the same save as the values. */
  setupDone: boolean
}>

/**
 * The account fields a patch sets, for a write to the account. A field the patch leaves out is not
 * in the result, so the server keeps its saved value.
 */
export function profileFields(next: ProfilePatch): Partial<ProfileInput> {
  const fields: Partial<ProfileInput> = {}
  if (next.settings) {
    fields.massKg = next.settings.massKg
    fields.bikeMassKg = next.settings.bikeMassKg
  }
  if (next.units !== undefined) fields.units = next.units
  if (next.keepFiles !== undefined) fields.keepFiles = next.keepFiles
  if (next.birthYear !== undefined) fields.birthYear = next.birthYear
  if (next.sex !== undefined) fields.sex = next.sex
  return fields
}

/** The athlete's values as the app shows them: the saved profile when signed in, else preferences. */
export interface AthleteValues {
  settings: AthleteSettings
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
}

/** The athlete's values as the saved profile holds them. */
export function athleteValuesOf(profile: Profile): AthleteValues {
  return {
    settings: { massKg: profile.massKg, bikeMassKg: profile.bikeMassKg },
    units: profile.units,
    birthYear: profile.birthYear,
    sex: profile.sex,
  }
}

/** The values after a patch. A field the patch leaves out keeps its current value. */
export function applyPatch(values: AthleteValues, patch: ProfilePatch): AthleteValues {
  return {
    settings: patch.settings ?? values.settings,
    units: patch.units ?? values.units,
    birthYear: patch.birthYear !== undefined ? patch.birthYear : values.birthYear,
    sex: patch.sex !== undefined ? patch.sex : values.sex,
  }
}

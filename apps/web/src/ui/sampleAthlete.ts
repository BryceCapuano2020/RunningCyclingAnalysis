import { DEFAULT_ATHLETE } from '@rca/core/synthetic'
import type { AthleteSettings } from '@rca/core/types'
import type { AgeProfile } from './grades'

/**
 * The sample athlete: a 37-year-old man at 75 kg. The sample's efforts are dated in 2025, and the
 * grades count the age from the birth year, so 1988 is 37 on each of them.
 */
export const SAMPLE_AGE = 37
export const SAMPLE_PROFILE: AgeProfile = { birthYear: 1988, sex: 'male' }

/** The body and bike masses the sample is analysed with, whatever the visitor has entered. */
export const SAMPLE_SETTINGS: AthleteSettings = {
  massKg: DEFAULT_ATHLETE.massKg,
  bikeMassKg: DEFAULT_ATHLETE.bikeMassKg,
}

/** The persona in words, for the banner and the landing example: "a 37-year-old man at 75 kg". */
export const SAMPLE_DESCRIPTION = `a ${SAMPLE_AGE}-year-old man at ${SAMPLE_SETTINGS.massKg} kg`
